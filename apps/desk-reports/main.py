"""Desk Reports, on this computer: puts a secret (the Slack webhook, the SMTP password)
into a file of its own on trade1, mode 600, outside the service's folder and its data.
The value goes over ssh's standard input: it is never part of a command line, a log
or a reply. The page only ever learns 'set' or 'not set' (from the service)."""
import subprocess

MACHINE = 'trade1'
FOLDER = '~/.desk-reports-secrets'
NAMES = ('slack_webhook', 'smtp_password')


def _ssh(command, text=''):
    try:
        r = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', MACHINE, command],
                           input=text, text=True, capture_output=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise RuntimeError(f'could not reach {MACHINE}: {type(e).__name__}') from None
    if r.returncode:
        last = (r.stderr.strip().splitlines() or ['ssh failed'])[-1]
        raise RuntimeError(f'could not save it on {MACHINE}: {last[:160]}')


def _name(args):
    name = str(args.get('name') or '')
    if name not in NAMES:
        raise ValueError('unknown secret')
    return name


def set_secret(args):
    name, value = _name(args), str(args.get('value') or '').strip()
    if not value or '\n' in value or '\r' in value:
        raise ValueError('nothing to save')
    if name == 'slack_webhook' and not value.lower().startswith('https://'):
        raise ValueError('a Slack webhook address starts with https://')
    f = f'{FOLDER}/{name}'
    _ssh(f'umask 077; mkdir -p {FOLDER} && chmod 700 {FOLDER} && cat > {f}.tmp && chmod 600 {f}.tmp && mv {f}.tmp {f}',
         value + '\n')
    return {'ok': True}


def clear_secret(args):
    _ssh(f'rm -f {FOLDER}/{_name(args)}')
    return {'ok': True}
