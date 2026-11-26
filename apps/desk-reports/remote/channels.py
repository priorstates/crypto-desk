"""Sending: email over SMTP, Slack through an incoming webhook.

The webhook URL and the SMTP password are secrets: each is a file of its own in
conf.SECRETS (mode 600), read at the moment of sending. Nothing here logs them,
and every error text goes through scrub() before it leaves this module."""
import json
import os
import re
import smtplib
import socket
import ssl
import urllib.error
import urllib.request
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

import conf

TIMEOUT = 12
_HOOK = re.compile(r'https?://[^\s\'"<>]+')


class SendError(Exception):
    pass


def secret(name):
    try:
        with open(os.path.join(conf.SECRETS, name)) as f:
            return f.read().strip()
    except OSError:
        return ''


def has(name):
    return bool(secret(name))


def scrub(text):
    """An error text with no secret in it: the secrets themselves, and any URL at all."""
    text = str(text)
    for name in ('slack_webhook', 'smtp_password'):
        s = secret(name)
        if s:
            text = text.replace(s, '[secret]')
            if name == 'slack_webhook' and '/' in s:
                tail = s.split('//', 1)[-1].split('/', 1)[-1]
                for part in [tail] + tail.split('/'):       # the path, and each long piece of it (the tokens)
                    if len(part) >= 8:
                        text = text.replace(part, '[secret]')
    return _HOOK.sub('[address]', text)[:240]


def recipients(s):
    return [a for a in re.split(r'[\s,;]+', s.get('email_to') or '') if a]


def email_ready(s):
    return bool(s.get('email_host') and recipients(s))


def send_email(s, subject, text, html):
    to = recipients(s)
    if not s.get('email_host') or not to:
        raise SendError('no SMTP host or no recipient is set')
    msg = EmailMessage()
    msg['Subject'], msg['From'], msg['To'] = subject, s['email_from'], ', '.join(to)
    msg['Date'] = formatdate(usegmt=True)
    msg['Message-ID'] = make_msgid(domain='desk-reports')
    msg.set_content(text)                       # the plain-text part
    msg.add_alternative(html, subtype='html')   # the HTML part
    host, port, mode = s['email_host'], int(s.get('email_port') or 25), str(s.get('email_tls') or 'none').lower()
    try:
        if mode == 'ssl':
            smtp = smtplib.SMTP_SSL(host, port, timeout=TIMEOUT, context=ssl.create_default_context())
        else:
            smtp = smtplib.SMTP(host, port, timeout=TIMEOUT)
        with smtp:
            if mode == 'starttls':
                smtp.starttls(context=ssl.create_default_context())
            if s.get('email_user'):
                smtp.login(s['email_user'], secret('smtp_password'))
            refused = smtp.send_message(msg, from_addr=s['email_from'], to_addrs=to)
        if refused:
            raise SendError('refused for ' + ', '.join(refused))
    except SendError:
        raise
    except smtplib.SMTPException as e:
        raise SendError(scrub(f'SMTP {host}:{port}: {type(e).__name__}: {e}')) from None
    except (OSError, socket.timeout) as e:
        raise SendError(scrub(f'cannot reach SMTP {host}:{port}: {e}')) from None


def send_slack(text):
    url = secret('slack_webhook')
    if not url:
        raise SendError('no Slack webhook is set')
    if not url.lower().startswith(('https://', 'http://')):
        raise SendError('the Slack webhook is not a web address')
    req = urllib.request.Request(url, data=json.dumps({'text': text}).encode(),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            if r.status != 200:
                raise SendError(f'Slack answered {r.status}')
    except SendError:
        raise
    except urllib.error.HTTPError as e:
        try:
            body = e.read(80).decode('utf-8', 'replace').strip()
        except Exception:
            body = ''
        raise SendError(scrub(f'Slack answered {e.code}' + (f': {body}' if body else ''))) from None
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise SendError(scrub(f'cannot reach Slack: {getattr(e, "reason", e)}')) from None
