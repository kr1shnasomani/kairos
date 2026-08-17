"""Acknowledgment signing + delivery ordering (routers/briefs.py).

Pure logic — no clients. The signature is the audit evidence for a PTW dual sign-off, so the
properties that matter are that it is deterministic, and that it actually binds every fact it
claims to bind (brief, user, action, time).
"""

from api.routers.briefs import _sign_acknowledgment

_ARGS = ("secret", "b-1", "user-a", "acknowledged", "2026-08-17T05:00:00+00:00")


def test_signature_is_deterministic():
    assert _sign_acknowledgment(*_ARGS) == _sign_acknowledgment(*_ARGS)


def test_signature_binds_each_field():
    """
    Change any one fact and the signature must change. If it did not, a signature captured on
    one brief could be replayed onto another — which is the forgery the signing exists to stop.
    """
    base = _sign_acknowledgment(*_ARGS)
    variants = [
        ("secret", "b-2", "user-a", "acknowledged", _ARGS[4]),          # different brief
        ("secret", "b-1", "user-b", "acknowledged", _ARGS[4]),          # different signer
        ("secret", "b-1", "user-a", "countersigned", _ARGS[4]),         # ack vs countersign
        ("secret", "b-1", "user-a", "acknowledged", "2026-08-17T06:00:00+00:00"),  # different time
        ("other-secret", "b-1", "user-a", "acknowledged", _ARGS[4]),    # different key
    ]
    for v in variants:
        assert _sign_acknowledgment(*v) != base, v


def test_ack_and_countersign_differ_for_same_user_and_time():
    """The two signatures in a dual sign-off must never collide into one value."""
    ack = _sign_acknowledgment("s", "b-1", "u", "acknowledged", _ARGS[4])
    counter = _sign_acknowledgment("s", "b-1", "u", "countersigned", _ARGS[4])
    assert ack != counter
