from __future__ import annotations

import os
import shutil
from pathlib import Path
from uuid import uuid4

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from flask import current_app


class StorageError(RuntimeError):
    pass


class BaseStorage:
    provider_name = "base"

    def save_uploaded_file(self, source_path: Path, filename: str, content_type: str) -> dict:
        raise NotImplementedError

    def delete_file(self, asset) -> None:
        raise NotImplementedError

    def open_file(self, asset):
        raise NotImplementedError


class S3Storage(BaseStorage):
    provider_name = "s3"

    def __init__(self) -> None:
        self.bucket = current_app.config["AWS_S3_BUCKET"]
        self.region = current_app.config["AWS_S3_REGION"]
        self.endpoint_url = current_app.config.get("AWS_S3_ENDPOINT_URL")
        self.client = boto3.client(
            "s3",
            aws_access_key_id=current_app.config.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=current_app.config.get("AWS_SECRET_ACCESS_KEY"),
            region_name=self.region,
            endpoint_url=self.endpoint_url,
        )

    def _build_url(self, key: str) -> str:
        if self.endpoint_url:
            return f"{self.endpoint_url.rstrip('/')}/{self.bucket}/{key}"
        return f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{key}"

    def save_uploaded_file(self, source_path: Path, filename: str, content_type: str) -> dict:
        key = f"secret-media/{uuid4()}-{filename}"
        try:
            self.client.upload_file(
                str(source_path),
                self.bucket,
                key,
                ExtraArgs={"ContentType": content_type},
            )
        except (BotoCoreError, ClientError) as exc:
            raise StorageError(f"S3 upload failed: {exc}") from exc
        return {
            "provider": self.provider_name,
            "storage_key": key,
            "storage_url": self._build_url(key),
            "local_path": None,
        }

    def delete_file(self, asset) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=asset.storage_key)
        except (BotoCoreError, ClientError) as exc:
            raise StorageError(f"S3 delete failed: {exc}") from exc

    def open_file(self, asset):
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=asset.storage_key)
            stream = response["Body"]
            length = response.get("ContentLength")
            return stream.iter_chunks(chunk_size=1024 * 256), length
        except (BotoCoreError, ClientError) as exc:
            raise StorageError(f"S3 stream failed: {exc}") from exc


class LocalStorage(BaseStorage):
    provider_name = "local"

    def __init__(self) -> None:
        self.media_dir = Path(current_app.config["LOCAL_MEDIA_DIR"])
        self.media_dir.mkdir(parents=True, exist_ok=True)

    def save_uploaded_file(self, source_path: Path, filename: str, content_type: str) -> dict:
        destination_name = f"{uuid4()}-{filename}"
        destination = self.media_dir / destination_name
        shutil.copy2(source_path, destination)
        return {
            "provider": self.provider_name,
            "storage_key": destination_name,
            "storage_url": destination_name,
            "local_path": str(destination),
        }

    def delete_file(self, asset) -> None:
        if asset.local_path and os.path.exists(asset.local_path):
            os.remove(asset.local_path)

    def open_file(self, asset):
        file_path = Path(asset.local_path)
        length = file_path.stat().st_size

        def iterator():
            with file_path.open("rb") as handle:
                while True:
                    chunk = handle.read(1024 * 256)
                    if not chunk:
                        break
                    yield chunk

        return iterator(), length


def get_storage() -> BaseStorage:
    if current_app.config.get("AWS_S3_BUCKET"):
        return S3Storage()
    return LocalStorage()
