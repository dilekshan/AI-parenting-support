import unittest
from types import SimpleNamespace
from unittest.mock import call, patch

from pydantic import SecretStr

from app.core.config import Settings
from app.services import email_service


class EmailServiceTests(unittest.TestCase):
    def setUp(self):
        self.settings = SimpleNamespace(
            SMTP_HOST="smtp.gmail.com",
            SMTP_PORT=587,
            SMTP_USERNAME="sender@gmail.com",
            SMTP_APP_PASSWORD=SecretStr("test-app-password"),
            SMTP_FROM_EMAIL="sender@gmail.com",
        )
        self.settings_patch = patch.object(email_service, "get_settings", return_value=self.settings)
        self.settings_patch.start()
        self.addCleanup(self.settings_patch.stop)

    @patch("app.services.email_service.smtplib.SMTP")
    def test_sends_message_over_starttls(self, smtp_factory):
        smtp = smtp_factory.return_value.__enter__.return_value

        email_service.send_email("recipient@example.com", "Test subject", "Test body")

        smtp_factory.assert_called_once_with("smtp.gmail.com", 587, timeout=10)
        smtp.ehlo.assert_has_calls([call(), call()])
        smtp.starttls.assert_called_once()
        self.assertIn("context", smtp.starttls.call_args.kwargs)
        smtp.login.assert_called_once_with("sender@gmail.com", "test-app-password")
        message = smtp.send_message.call_args.args[0]
        self.assertEqual(message["From"], "sender@gmail.com")
        self.assertEqual(message["To"], "recipient@example.com")
        self.assertEqual(message["Subject"], "Test subject")
        self.assertEqual(message.get_content(), "Test body\n")

        method_order = [entry[0] for entry in smtp.method_calls]
        self.assertLess(method_order.index("starttls"), method_order.index("login"))
        self.assertLess(method_order.index("login"), method_order.index("send_message"))

    @patch("app.services.email_service.smtplib.SMTP")
    def test_missing_credentials_fail_before_connecting(self, smtp_factory):
        self.settings.SMTP_APP_PASSWORD = SecretStr("")

        with self.assertRaisesRegex(RuntimeError, "SMTP email service is not configured"):
            email_service.send_email("recipient@example.com", "Test subject", "Test body")

        smtp_factory.assert_not_called()

    def test_smtp_settings_are_loaded_with_secret_password_type(self):
        settings = Settings(
            _env_file=None,
            DB_HOST="localhost",
            DB_USER="test",
            DB_PASSWORD="test-password",
            JWT_SECRET="x" * 32,
            SMTP_HOST="smtp.gmail.com",
            SMTP_PORT="587",
            SMTP_USERNAME="sender@gmail.com",
            SMTP_APP_PASSWORD="test-app-password",
            SMTP_FROM_EMAIL="sender@gmail.com",
        )

        self.assertEqual(settings.SMTP_HOST, "smtp.gmail.com")
        self.assertEqual(settings.SMTP_PORT, 587)
        self.assertIsInstance(settings.SMTP_APP_PASSWORD, SecretStr)
        self.assertEqual(str(settings.SMTP_APP_PASSWORD), "**********")


if __name__ == "__main__":
    unittest.main()