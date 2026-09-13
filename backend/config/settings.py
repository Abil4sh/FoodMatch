"""Django settings for the FoodMatch API.

Development-oriented defaults, but every security-relevant value is read from
the environment so a production deployment overrides them rather than editing
this file.

There is no Google integration at this stage: no keys, no clients, no URLs.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Loads backend/.env when present. The file is gitignored; .env.example is the
# tracked template and contains no real values.
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


# --- core -------------------------------------------------------------------

# Dev-only fallback. Deploying without setting DJANGO_SECRET_KEY is refused
# below rather than silently running on a known key.
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-insecure-key-do-not-use-in-production")

DEBUG = env_bool("DJANGO_DEBUG", "true")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

if not DEBUG and SECRET_KEY.startswith("dev-only"):
    raise RuntimeError(
        "DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false. "
        "Copy .env.example to .env and set a real value."
    )

INSTALLED_APPS = [
    # auth + contenttypes are required because DRF resolves request.user on
    # every request (as AnonymousUser here). No accounts, no login, no queries.
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "api",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # CORS must sit above CommonMiddleware so preflights are answered correctly.
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]

# No models, no user accounts, no sessions at this stage: the catalog is
# read-only JSON. A database is therefore not configured.
DATABASES = {}

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True

# --- CORS -------------------------------------------------------------------

# Explicit origins only. CORS_ALLOW_ALL_ORIGINS is never set.
CORS_ALLOWED_ORIGINS = env_list(
    "DJANGO_CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
)
CORS_ALLOW_CREDENTIALS = False
CORS_ALLOW_METHODS = ["GET", "OPTIONS"]

# --- CSRF -------------------------------------------------------------------

# The API is read-only and unauthenticated, so there is no cookie session for
# CSRF to protect. Trusted origins are still declared for when writes arrive.
CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)

# --- DRF --------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    # Views declare their own throttle classes; see api/views.py for why
    # ScopedRateThrottle is deliberately not used.
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {
        # Generous for a local prototype, but the ceiling exists now so the
        # architecture is already throttled before anything costly is added.
        "catalog": os.getenv("DJANGO_THROTTLE_CATALOG", "120/min"),
        "detail": os.getenv("DJANGO_THROTTLE_DETAIL", "60/min"),
        # Deliberately the tightest scope: this is the only endpoint that can
        # reach a paid upstream API, so it is the one worth rationing.
        "search": os.getenv("DJANGO_THROTTLE_SEARCH", "15/min"),
    },
    "EXCEPTION_HANDLER": "api.views.safe_exception_handler",
}

# --- hardening --------------------------------------------------------------

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "same-origin"

if not DEBUG:
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", "true")
    SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# Never log request bodies or headers at this stage; keep output minimal so no
# future credential can leak through a debug log.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.getenv("DJANGO_LOG_LEVEL", "INFO")},
}
