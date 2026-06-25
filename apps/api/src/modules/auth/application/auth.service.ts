import { Injectable } from '@nestjs/common';
import { GarageOsApiException } from '../../../shared/api/api-exception';
import {
  ChangePasswordRequest,
  EmailVerificationConfirmRequest,
  ForgotPasswordRequest,
  LoginRequest,
  ResetPasswordRequest,
} from '../api/auth.schemas';
import {
  AuthLoginResponseData,
  AuthRefreshResponseData,
  AuthSessionResponseData,
} from '../contracts';

@Injectable()
export class AuthService {
  signupOwner(): never {
    return this.authUnavailable();
  }

  login(request: LoginRequest): AuthLoginResponseData {
    throw GarageOsApiException.serviceUnavailable('Authentication is not available yet.');
  }

  refresh(): AuthRefreshResponseData {
    throw GarageOsApiException.serviceUnavailable('Authentication is not available yet.');
  }

  logout(): never {
    return this.authUnavailable();
  }

  logoutAll(): never {
    return this.authUnavailable();
  }

  resendEmailVerification(): never {
    return this.authUnavailable();
  }

  confirmEmailVerification(request: EmailVerificationConfirmRequest): never {
    void request;

    return this.authUnavailable();
  }

  forgotPassword(request: ForgotPasswordRequest): never {
    void request;

    return this.authUnavailable();
  }

  resetPassword(request: ResetPasswordRequest): never {
    void request;

    return this.authUnavailable();
  }

  changePassword(request: ChangePasswordRequest): never {
    void request;

    return this.authUnavailable();
  }

  getSession(): AuthSessionResponseData {
    throw GarageOsApiException.serviceUnavailable('Authentication is not available yet.');
  }

  private authUnavailable(): never {
    throw GarageOsApiException.serviceUnavailable(
      'Authentication routes are available, but authentication is not implemented yet.',
    );
  }
}
