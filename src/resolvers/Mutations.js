import { generateOtp } from "../util/otp.js";
import { verifyOTP } from "../util/otp.js";
import ReactionError from "@reactioncommerce/reaction-error";
import pkg from "mongodb";
import ObjectID from "mongodb";
const { Long } = pkg;
import password_1 from "@accounts/password";
import server_1 from "@accounts/server";
import { canCreateUser } from "../util/checkUserRole.js";
import { getGroupData } from "../util/getGroupData.js";

export default {
  async sendOTP(parent, args, context, info) {
    // console.log("sending otp console");
    const { collections } = context;
    const { users } = collections;

    // console.log("sendOTP");
    let msisdn;
    if (args.phone && args.phone.length > 10 && args.phone[0] == "+") {
      msisdn = args.phone;
    } else if (args.email) {
      const userExist = await users.findOne({
        "emails.0.address": args?.email,
      });
      if (!userExist) {
        throw new Error("User does not exist");
      }
      msisdn = userExist.phone;
    } else {
      throw Error("Invalid phone number");
    }

    const res = await generateOtp(msisdn);
    // console.log("res", res);
    return res;
  },
  async checkUserExist(parent, args, context, info) {
    const { collections } = context;
    const { users } = collections;
    const email = args.email;
    const phone = args.phone;
    // console.log(args);

    let userExist = await users.findOne({ phone: phone });
    if (!userExist) {
      userExist = await users.findOne({ "emails.0.address": email });
    }

    // console.log("userExist");
    // console.log(userExist);

    if (userExist !== null) {
      return true;
    } else {
      return false;
    }
  },
  verifyOTP(parent, args, context, info) {
    return verifyOTP(args.phone, args.otp, context);
  },
  resetPassword: async (_, { token, newPassword }, { injector, infos }) => {
    return injector
      .get(password_1.AccountsPassword)
      .resetPassword(token, newPassword, infos);
  },

  sendResetPasswordEmail: async (_, { email }, { injector }, ctx) => {
    const { backgroundJobs, collections } = ctx;
    const accountsServer = injector.get(server_1.AccountsServer);
    const accountsPassword = injector.get(password_1.AccountsPassword);
    // const randomNumber = Math.floor(Math.random() * 1000000);
    // console.log(accountsServer)
    // const user = await accountsServer.findUserByEmail(email);
    // console.log(user)
    // if (!user) {
    //   throw new Error('User not found');
    // }
    try {
      // const otp = Math.floor(Math.random() * 1000000);
      // console.log(otp)
      // await accountsPassword.sendResetPasswordEmail(user.id, otp);
      // console.log(accountsPassword)
      // await accountsPassword.sendResetPasswordEmail(user, otp);
      await accountsPassword.sendResetPasswordEmail(email);
    } catch (error) {
      // If ambiguousErrorMessages is true,
      // to prevent user enumeration we fail silently in case there is no user attached to this email
      if (
        accountsServer.options.ambiguousErrorMessages &&
        error instanceof server_1.AccountsJsError &&
        error.code === password_1.SendResetPasswordEmailErrors.UserNotFound
      ) {
        return null;
      }
      throw error;
    }
    return null;
  },
  async createUser(_, { user }, ctx) {
    const { injector, infos, collections } = ctx;
    const { Accounts } = collections;
    const accountsServer = injector.get(server_1.AccountsServer);
    const accountsPassword = injector.get(password_1.AccountsPassword);
    let userId;
    if (!ctx.authToken) {
      throw new ReactionError("access-denied", "Please Login First");
    }
    if (ctx.user === undefined || ctx.user === null) {
      throw new ReactionError("access-denied", "Please Login First");
    }
    userId = await accountsPassword.createUser(user);
    if (!accountsServer.options.enableAutologin) {
      return {
        userId: accountsServer.options.ambiguousErrorMessages ? null : userId,
      };
    }
    if (userId) {
      const now = new Date();
      const account = {
        _id: userId,
        acceptsMarketing: false,
        emails: [
          {
            address: user.email,
            verified: false,
            provides: "default",
          },
        ],
        name: null,
        profile: {
          firstName: user.firstName,
          lastName: user.lastName,
          dob: user.dob,
          phone: user.phone,
        },
        shopId: null,
        state: "new",
        userId: userId,
        UserRole: user.UserRole,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        isActive: false,
      };
      const accountAdded = await Accounts.insertOne(account);
      // console.log("account Added:- ", accountAdded)
    }
    // When initializing AccountsServer we check that enableAutologin and ambiguousErrorMessages options
    // are not enabled at the same time
    const createdUser = await accountsServer.findUserById(userId);
    // If we are here - user must be created successfully
    // Explicitly saying this to Typescript compiler
    const loginResult = await accountsServer.loginWithUser(createdUser, infos);

    return {
      userId,
      loginResult,
    };
  },

  changePassword: async (
    _,
    { oldPassword, newPassword },
    { user, injector }
  ) => {
    if (!(user && user.id)) {
      throw new Error("Unauthorized");
    }
    const userId = user.id;
    await injector
      .get(password_1.AccountsPassword)
      .changePassword(userId, oldPassword, newPassword);
    return null;
  },
  async createUserWithOtp(_, { user }, ctx) {
    const { injector, infos, collections } = ctx;
    const accountsServer = injector.get(server_1.AccountsServer);
    const accountsPassword = injector.get(password_1.AccountsPassword);
    const { Accounts, users } = collections;

    let userId;

    try {
      userId = await accountsPassword.createUser(user);
      if (userId) {
        const now = new Date();
        const account = {
          _id: userId,
          acceptsMarketing: false,
          emails: [
            {
              address: user.email,
              verified: false,
              provides: "default",
            },
          ],
          name: null,
          profile: {
            firstName: user.firstName,
            lastName: user.lastName,
            dob: user.dob,
            phone: user.phone,
          },
          shopId: null,
          state: "new",
          userId: userId,
          createdAt: now,
        };
        // const accountAdded = await Accounts.insertOne({
        //   _id: userId,
        //   firstName: user.firstName,
        //   lastName: user.lastName,
        //   name: user.firstName + " " + user.lastName,
        //   phone: user.phone,
        //   UserRole: user.UserRole
        // });
        const accountAdded = await Accounts.insertOne(account);
        // console.log("create User With Otp account Added:- ", accountAdded)
      }
    } catch (error) {
      // If ambiguousErrorMessages is true we obfuscate the email or username already exist error
      // to prevent user enumeration during user creation
      if (
        accountsServer.options.ambiguousErrorMessages &&
        error instanceof server_1.AccountsJsError &&
        (error.code === password_1.CreateUserErrors.EmailAlreadyExists ||
          error.code === password_1.CreateUserErrors.UsernameAlreadyExists)
      ) {
        return {};
      }
      throw error;
    }
    if (!accountsServer.options.enableAutologin) {
      return {
        userId: accountsServer.options.ambiguousErrorMessages ? null : userId,
      };
    }

    const adminCount = await Accounts.findOne({
      "adminUIShopIds.0": { $ne: null },
    });
    // console.log("adminCount", adminCount);
    if (userId && adminCount?._id) {
      // console.log("user", user);
      const account = {
        _id: userId,
        acceptsMarketing: false,
        emails: [
          {
            address: user.email,
            verified: false,
            provides: "default",
          },
        ],
        groups: [],
        name: null,
        profile: {
          firstName: user.firstName,
          lastName: user.lastName,
          dob: user.dob,
          phone: user.phone,
        },
        shopId: null,
        state: "new",
        userId: userId,
      };
      const accountAdded = await Accounts.insertOne(account);
      // console.log("createUserWithOtp Account Lower", accountAdded)
    }
    // When initializing AccountsServer we check that enableAutologin and ambiguousErrorMessages options
    // are not enabled at the same time
    const createdUser = await accountsServer.findUserById(userId);
    // If we are here - user must be created successfully
    // Explicitly saying this to Typescript compiler
    const loginResult = await accountsServer.loginWithUser(createdUser, infos);
    await generateOtp(user.phone);
    return {
      userId,
      // loginResult,
    };
  },
  authenticate: async (_, args, ctx) => {
    const { serviceName, params } = args;
    const { injector, infos, collections } = ctx;
    const { users, Accounts } = collections;
    // console.log("authenticate");
    // console.log("params ", params);
    // console.log("params.user.email :  ", params.user.email);
    const AccountResp = await Accounts.findOne({
      "emails.0.address": params?.user?.email,
    });
    // console.log("AccountResp :  ", AccountResp);
    if (AccountResp) {
      if (AccountResp.isActive == true) {
        const authenticated = await injector
          .get(server_1.AccountsServer)
          .loginWithService(serviceName, params, infos);
        console.log("authenticate", authenticated);
        return authenticated;
      } else {
        throw new ReactionError("not-found", "Contact administrator");
      }
    } else {
      throw new ReactionError("not-found", "User not found");
    }
  },
  authenticateWithOTP: async (_, args, ctx) => {
    const { serviceName, params } = args;
    const { injector, infos, collections } = ctx;
    const { users } = collections;
    const userExist = await users.findOne({
      "emails.0.address": params?.user?.email,
    });
    // console.log("user exist is ", userExist);
    const resOTP = await verifyOTP(userExist.phone, params.code, ctx);
    // console.log("status", resOTP);
    // console.log(userExist)
    // if (userExist.phoneVerified) {
    //         const authenticated = await injector
    //                 .get(server_1.AccountsServer)
    //                 .loginWithService(serviceName, params, infos);
    //         return authenticated;
    // }
    // else
    if (!resOTP?.status) {
      return null;
    } else {
      const authenticated = await injector
        .get(server_1.AccountsServer)
        .loginWithService(serviceName, params, infos);
      // console.log("authenticated", authenticated);
      return authenticated;
    }
  },
  async deleteUser(parent, args, context, info) {
    // console.log("context.user ", context.user);
    // console.log("args ", args);
    // console.log("context ", context)
    if (context.user === undefined || context.user === null) {
      throw new Error("Unauthorized access. Please login first");
    }
    if (!context.authToken) {
      throw new Error("Unauthorized");
    }

    const { users, Accounts } = context.collections;
    const { userId } = args;

    const query = { _id: ObjectID(userId) };
    // console.log("query:", query);

    // const usersList = await users.find().toArray();
    // usersList.forEach(user => {
    //   console.log(user.phone);
    //   return user.phone
    // });

    const userAccountResponse = await Accounts.findOne({ _id: args.userId });
    if (
      userAccountResponse &&
      userAccountResponse.adminUIShopIds &&
      userAccountResponse.adminUIShopIds.length > 0
    ) {
      throw new Error("Cannot delete Super Admin");
    }
    const userResponse = await users.findOne({ _id: args.userId });
    // console.log("User Response : ", userResponse);
    if (!userResponse) {
      throw new Error(`User not found`);
    }
    const UserPermission = await canCreateUser(
      context.user.UserRole,
      userResponse.UserRole
    );
    // console.log(UserPermission);
    if (UserPermission) {
      const deleteResult = await users.deleteOne({ _id: args.userId });
      // console.log(deleteResult);
      const deleteAccountResult = await Accounts.deleteOne({
        _id: args.userId,
      });
      if (
        deleteResult.deletedCount > 0 ||
        deleteAccountResult.deletedCount > 0
      ) {
        return true; // User deleted successfully, return true
      } else {
        return false;
      }
    } else {
      // Deny user creation
      throw new Error("Unauthorized");
    }
    return UserPermission;
  },
  async addMember(parent, { input }, context, info) {
    // console.log("args :: ", input);
    const { injector, infos, collections } = context;
    const { Accounts } = collections;
    const accountsServer = injector.get(server_1.AccountsServer);
    const accountsPassword = injector.get(password_1.AccountsPassword);
    // console.log("auth Token : ", context.authToken);
    // console.log("user info : ", context.user);
    let userId;
    if (!context.authToken) {
      throw new ReactionError("access-denied", "Please Login First");
    }
    if (context.user === undefined || context.user === null) {
      throw new ReactionError("access-denied", "Please Login First");
    }
    if (input.memberRole === "shopOwner") {
      userId = await accountsPassword.createUser(input);
      console.log("userId : ", userId);
      if (!accountsServer.options.enableAutologin) {
        return {
          userId: accountsServer.options.ambiguousErrorMessages ? null : userId,
        };
      }
      if (userId) {
        const now = new Date();
        const account = {
          _id: userId,
          acceptsMarketing: false,
          emails: [
            {
              address: input.email,
              verified: false,
              provides: "default",
            },
          ],
          name: null,
          profile: {
            firstName: input.firstName,
            lastName: input.lastName,
            dob: input.dob,
            phone: input.phone,
          },
          shopId: null,
          state: "new",
          userId: userId,
          memberRole: input.memberRole,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
          isActive: true,
        };
        const accountAdded = await Accounts.insertOne(account);
        console.log("accountAdded ", accountAdded);
        return {
          status: true,
          message: "account created",
          userData: accountAdded.ops[0],
        };
      }
    } else if (input.memberRole === "shopMember") {
      console.log("shopMember ");
      // console.log("auth Token : ", context.authToken);
      // console.log("user info : ", context.user);
      userId = await accountsPassword.createUser(input);
      console.log("userId : ", userId);
      if (!accountsServer.options.enableAutologin) {
        return {
          userId: accountsServer.options.ambiguousErrorMessages ? null : userId,
        };
      }
      if (userId) {
        const now = new Date();
        const account = {
          _id: userId,
          acceptsMarketing: false,
          emails: [
            {
              address: input.email,
              verified: false,
              provides: "default",
            },
          ],
          name: null,
          profile: {
            firstName: input.firstName,
            lastName: input.lastName,
            dob: input.dob,
            phone: input.phone,
          },
          shopId: null,
          state: "new",
          userId: userId,
          memberRole: input.memberRole,
          parentId: input.parentId,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
          isActive: true,
        };
        const accountAdded = await Accounts.insertOne(account);
        console.log("accountAdded ", accountAdded);
        return {
          status: true,
          message: "account created",
          userData: accountAdded.ops[0],
        };
      }
    }
  },
};
