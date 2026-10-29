import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import get_settings


def send_email(recipient: str, subject: str, body: str) -> None:
    settings = get_settings()
    username = settings.SMTP_USERNAME.strip()
    app_password = settings.SMTP_APP_PASSWORD.get_secret_value()
    from_email = settings.SMTP_FROM_EMAIL.strip()
    if not all((settings.SMTP_HOST.strip(), username, app_password, from_email)):
        raise RuntimeError("SMTP email service is not configured.")

    message = EmailMessage()
    message["From"] = from_email
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
        smtp.ehlo()
        smtp.starttls(context=ssl.create_default_context())
        smtp.ehlo()
        smtp.login(username, app_password)
        smtp.send_message(message)