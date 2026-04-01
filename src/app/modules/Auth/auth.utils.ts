const createForgotPasswordTemplate = async (resetLink: string) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password Reset Request</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f7fa;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
          
          <!-- Logo/Brand Section -->
          <tr>
            <td style="padding: 48px 48px 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #1a202c; letter-spacing: -0.5px;">Reset Your Password</h1>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 0 48px 40px;">
              
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #4a5568;">
                Hi there,
              </p>
              
              <p style="margin: 0 0 32px; font-size: 16px; line-height: 1.6; color: #4a5568;">
                We received a request to reset the password for your account. Click the button below to create a new password:
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 0 0 32px;">
                    <a href="${resetLink}" 
                       style="display: inline-block; background: linear-gradient(135deg, #2B5EA6 0%, #1e4278 100%); color: #ffffff; padding: 16px 40px; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(43, 94, 166, 0.4); transition: all 0.3s ease;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Info Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f7fafc; border-left: 4px solid #2B5EA6; border-radius: 6px; margin-bottom: 32px;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #4a5568;">
                      <strong style="color: #2d3748;">Security tip:</strong> This link will expire in 1 hour. If you didn't request this reset, please ignore this email or contact our support team.
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- Alternative Link -->
              <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #718096;">
                Button not working? Copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 32px; font-size: 13px; word-break: break-all; color: #2B5EA6;">
                ${resetLink}
              </p>
              
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #4a5568;">
                Best regards,<br>
                <strong style="color: #2d3748;">The Support Team</strong>
              </p>
              
            </td>
          </tr>
          
          <!-- Divider -->
          <tr>
            <td style="padding: 0 48px;">
              <div style="height: 1px; background-color: #e2e8f0;"></div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 32px 48px; text-align: center;">
              
              <p style="margin: 0 0 16px; font-size: 13px; line-height: 1.5; color: #a0aec0;">
                This is an automated message, please do not reply to this email.
              </p>
              
              <p style="margin: 0; font-size: 12px; color: #cbd5e0;">
                © 2025 Your Company Name. All rights reserved.
              </p>
              
            </td>
          </tr>
          
        </table>
        
      </td>
    </tr>
  </table>
  
</body>
</html>`;
};

export const AuthUtils = { createForgotPasswordTemplate };
