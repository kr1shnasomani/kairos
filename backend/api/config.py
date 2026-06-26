"""
KAIROS — Application Configuration
All settings are read from environment variables (via .env file in development).
"""

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # -------------------------------------------------------------------------
    # App
    # -------------------------------------------------------------------------
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    APP_VERSION: str = "0.1.0"
    APP_SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION"
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8000"]

    # -------------------------------------------------------------------------
    # Supabase (cloud — filled in later)
    # -------------------------------------------------------------------------
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""
    SUPABASE_STORAGE_BUCKET: str = "kairos-vault"

    # -------------------------------------------------------------------------
    # Neo4j (local Docker)
    # -------------------------------------------------------------------------
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USERNAME: str = "neo4j"
    NEO4J_PASSWORD: str = "kairos_dev_password"
    NEO4J_DATABASE: str = "neo4j"

    # -------------------------------------------------------------------------
    # Qdrant (local Docker)
    # -------------------------------------------------------------------------
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: str = ""
    QDRANT_COLLECTION_KNOWLEDGE: str = "kairos_knowledge"
    QDRANT_COLLECTION_DOCUMENTS: str = "kairos_documents"

    # -------------------------------------------------------------------------
    # Elasticsearch (local Docker)
    # -------------------------------------------------------------------------
    ELASTICSEARCH_URL: str = "http://localhost:9200"
    ELASTICSEARCH_USERNAME: str = ""
    ELASTICSEARCH_PASSWORD: str = ""
    ELASTICSEARCH_INDEX_ASSETS: str = "kairos_assets"
    ELASTICSEARCH_INDEX_DOCUMENTS: str = "kairos_documents"
    ELASTICSEARCH_INDEX_EVENTS: str = "kairos_events"

    # -------------------------------------------------------------------------
    # Redis (local Docker)
    # -------------------------------------------------------------------------
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_PASSWORD: str = ""
    REDIS_DB_CACHE: int = 0
    REDIS_DB_CELERY: int = 1
    REDIS_DB_STREAMS: int = 2
    REDIS_STREAM_WORK_ORDERS: str = "kairos:events:work_orders"
    REDIS_STREAM_PTW: str = "kairos:events:ptw"
    REDIS_STREAM_SHIFT_HANDOVER: str = "kairos:events:shift_handover"
    REDIS_STREAM_ALARMS: str = "kairos:events:alarms"
    REDIS_STREAM_BRIEFS: str = "kairos:events:briefs"

    # -------------------------------------------------------------------------
    # NVIDIA NIM (cloud, key provided later)
    # -------------------------------------------------------------------------
    NVIDIA_NIM_API_KEY: str = ""
    NVIDIA_NIM_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    NVIDIA_NIM_MODEL: str = "meta/llama-3.1-70b-instruct"
    NVIDIA_NIM_MAX_TOKENS: int = 4096
    NVIDIA_NIM_TEMPERATURE: float = 0.1

    # -------------------------------------------------------------------------
    # Ollama (local, fallback)
    # -------------------------------------------------------------------------
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:14b"
    OLLAMA_EMBED_MODEL: str = "nomic-embed-text"

    # -------------------------------------------------------------------------
    # Embeddings
    # -------------------------------------------------------------------------
    EMBEDDING_DIMENSION: int = 768

    # -------------------------------------------------------------------------
    # HuggingFace
    # -------------------------------------------------------------------------
    HF_MODEL_NER: str = "xlm-roberta-large"
    HF_MODEL_CLASSIFIER: str = "bert-base-multilingual-cased"
    HF_CACHE_DIR: str = "./.cache/huggingface"
    HF_TOKEN: str = ""

    # -------------------------------------------------------------------------
    # Celery
    # -------------------------------------------------------------------------
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # -------------------------------------------------------------------------
    # Temporal
    # -------------------------------------------------------------------------
    TEMPORAL_ADDRESS: str = "localhost:7233"
    TEMPORAL_NAMESPACE: str = "default"
    TEMPORAL_TASK_QUEUE: str = "kairos-ingestion"
    TEMPORAL_TASK_QUEUE_ELICITATION: str = "kairos-elicitation"

    # -------------------------------------------------------------------------
    # OPA
    # -------------------------------------------------------------------------
    OPA_URL: str = "http://localhost:8181"

    # -------------------------------------------------------------------------
    # Vault
    # -------------------------------------------------------------------------
    VAULT_ADDR: str = "http://localhost:8200"
    VAULT_TOKEN: str = "kairos-dev-root-token"

    # -------------------------------------------------------------------------
    # OpenTelemetry
    # -------------------------------------------------------------------------
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://localhost:4317"
    OTEL_SERVICE_NAME: str = "kairos-api"
    OTEL_SERVICE_VERSION: str = "0.1.0"

    # -------------------------------------------------------------------------
    # EEMUA 191 Push Governor
    # -------------------------------------------------------------------------
    MAX_PUSH_PER_USER_PER_HOUR: int = 6
    BRIEF_COOLDOWN_HOURS: int = 4
    DEDUP_WINDOW_MINUTES: int = 10
    LATE_ARRIVAL_WINDOW_MINUTES: int = 5

    # -------------------------------------------------------------------------
    # Go Connector
    # -------------------------------------------------------------------------
    GO_CONNECTOR_PORT: int = 8090
    HISTORIAN_QUERY_TIMEOUT_SECONDS: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
