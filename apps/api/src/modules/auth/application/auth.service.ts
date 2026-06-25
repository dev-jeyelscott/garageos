import { Injectable } from '@nestjs/common';
import { GarageOsApiException } from '../../../shared/api/api-exception';
import {
  ChangePasswordRequest,
  EmailVerificationConfirmRequest,
  ForgotPasswordRequest,
  LoginRequest,
  ResetPasswordRequest,
} from '../api/auth.schemas';

@Injectable()
export class AuthService {
  signupOwner(): never {
    return this.authUnavailable();
  }

  login(request: LoginRequest): never {
    void request;

    return this.authUnavailable();
  }

  refresh(): never {
    return this.authUnavailable();
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

  getSession(): never {
    return this.authUnavailable();
  }

  private authUnavailable(): never {
    throw GarageOsApiException.serviceUnavailable(
      'Authentication routes are available, but authentication is not implemented yet.',
    );
  }
}
