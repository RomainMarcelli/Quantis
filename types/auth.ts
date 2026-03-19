export type LoginCredentials = {
  email: string;
  password: string;
};

export type AuthenticatedUser = {
  uid: string;
  email: string | null;
};

export type LoginValidationErrors = {
  email?: string;
  password?: string;
  general?: string;
};

export type LoginResult =
  | {
      success: true;
      user: AuthenticatedUser;
    }
  | {
      success: false;
      errors: LoginValidationErrors;
    };
