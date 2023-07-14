import ReactionError from "@reactioncommerce/reaction-error";

export default {
  async getAllMembers(parent, args, context, info) {
    const { collections } = context;
    const { Accounts } = collections;
    if (!context.authToken) {
      throw new ReactionError("access-denied", "Please Login First");
    }
    if (context.user === undefined || context.user === null) {
      throw new ReactionError("access-denied", "Please Login First");
    }
    const memberDataResponse = await Accounts.find({
      parentId: context.user._id || context.user.id,
      memberRole: "shopMember",
    }).toArray();
    console.log("memberDataResponse ", memberDataResponse);
    if (memberDataResponse) {
      return {
        status: true,
        message: "Members Found",
        userData: memberDataResponse,
      };
    } else {
      return {
        status: false,
        message: "Members not found",
        userData: null,
      };
    }
  },
};
