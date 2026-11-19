-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'MAINTENANCE', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('DESKTOP', 'WEB', 'HYBRID', 'CLI');

-- CreateEnum
CREATE TYPE "OperatingSystem" AS ENUM ('WINDOWS', 'MACOS', 'LINUX');

-- CreateEnum
CREATE TYPE "CpuArchitecture" AS ENUM ('X86_64', 'ARM64', 'UNIVERSAL');

-- CreateEnum
CREATE TYPE "PackageFormat" AS ENUM ('EXE', 'MSI', 'DMG', 'PKG', 'APPIMAGE', 'DEB', 'RPM', 'TAR_GZ', 'ZIP');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('DISCOVERED', 'VALIDATING', 'VALIDATED', 'REJECTED', 'APPROVED', 'PUBLISHED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AssetVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SSE_HUB', 'SSE_ADMIN', 'EMAIL', 'WEBHOOK_OUTBOUND');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "role_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "mfa_secret" VARCHAR(255),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_recovery_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "refresh_token_hash" VARCHAR(255),
    "last_login_at" TIMESTAMPTZ,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(80) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_user_id" UUID,
    "actor_email" VARCHAR(255) NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(64) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "summary" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "developer" VARCHAR(120) NOT NULL DEFAULT 'HENU OS PRIVATE LIMITED',
    "icon_url" VARCHAR(512) NOT NULL,
    "banner_url" VARCHAR(512),
    "homepage_url" VARCHAR(512),
    "docs_url" VARCHAR(512),
    "license" VARCHAR(60) NOT NULL DEFAULT 'Proprietary',
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "app_type" "ApplicationType" NOT NULL DEFAULT 'DESKTOP',
    "min_hub_version" VARCHAR(30),
    "web_app_url" VARCHAR(512),
    "dependencies" JSONB,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL DEFAULT 'GITHUB',
    "repo_owner" VARCHAR(100) NOT NULL,
    "repo_name" VARCHAR(100) NOT NULL,
    "github_installation_id" BIGINT NOT NULL,
    "target_branch" VARCHAR(100) NOT NULL DEFAULT 'main',
    "asset_pattern" VARCHAR(255) NOT NULL,
    "tag_pattern" VARCHAR(255) NOT NULL DEFAULT '^v?[0-9]+\.[0-9]+\.[0-9]+',
    "auto_ingest_releases" BOOLEAN NOT NULL DEFAULT true,
    "auto_publish_channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "repository_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_channels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(40) NOT NULL,
    "description" TEXT,
    "auto_promote_rule" JSONB,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "release_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_compatibilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "os" "OperatingSystem" NOT NULL,
    "arch" "CpuArchitecture" NOT NULL,
    "package_format" "PackageFormat" NOT NULL,
    "min_os_version" VARCHAR(30),
    "max_os_version" VARCHAR(30),
    "launch_executable_name" VARCHAR(120),
    "install_instructions" TEXT,
    "is_supported" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "platform_compatibilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "repository_connection_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "semver_major" INTEGER NOT NULL,
    "semver_minor" INTEGER NOT NULL,
    "semver_patch" INTEGER NOT NULL,
    "semver_prerelease" VARCHAR(50),
    "tag_name" VARCHAR(100) NOT NULL,
    "git_commit_sha" VARCHAR(40) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "changelog" TEXT NOT NULL,
    "github_release_id" BIGINT NOT NULL,
    "github_published_at" TIMESTAMPTZ NOT NULL,
    "is_prerelease" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'DISCOVERED',
    "published_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "provenance_payload" JSONB,
    "revocation_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "release_id" UUID NOT NULL,
    "platform_compatibility_id" UUID,
    "github_asset_id" BIGINT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "download_url" VARCHAR(1024) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "content_type" VARCHAR(120) NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "signature_url" VARCHAR(1024),
    "signature_type" VARCHAR(50),
    "is_signature_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_installable" BOOLEAN NOT NULL DEFAULT false,
    "verification_status" "AssetVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verification_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "release_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "revision_number" INTEGER NOT NULL,
    "published_by_admin_id" UUID,
    "content_hash" VARCHAR(64) NOT NULL,
    "manifest_payload" JSONB NOT NULL,
    "application_count" INTEGER NOT NULL,
    "release_count" INTEGER NOT NULL,
    "summary" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalogue_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_id" VARCHAR(64) NOT NULL,
    "event_type" VARCHAR(60) NOT NULL,
    "repository_connection_id" UUID,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "processed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID,
    "event_trigger" VARCHAR(80) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "target_destination" VARCHAR(255),
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_role_id_idx" ON "admin_users"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_admin_user_id_created_at_idx" ON "audit_logs"("admin_user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "applications_slug_key" ON "applications"("slug");

-- CreateIndex
CREATE INDEX "applications_slug_idx" ON "applications"("slug");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- CreateIndex
CREATE INDEX "applications_category_idx" ON "applications"("category");

-- CreateIndex
CREATE INDEX "repository_connections_application_id_idx" ON "repository_connections"("application_id");

-- CreateIndex
CREATE INDEX "repository_connections_repo_owner_repo_name_is_active_idx" ON "repository_connections"("repo_owner", "repo_name", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "repository_connections_repo_owner_repo_name_key" ON "repository_connections"("repo_owner", "repo_name");

-- CreateIndex
CREATE UNIQUE INDEX "release_channels_name_key" ON "release_channels"("name");

-- CreateIndex
CREATE INDEX "platform_compatibilities_application_id_is_supported_idx" ON "platform_compatibilities"("application_id", "is_supported");

-- CreateIndex
CREATE UNIQUE INDEX "platform_compatibilities_application_id_os_arch_package_format_key" ON "platform_compatibilities"("application_id", "os", "arch", "package_format");

-- CreateIndex
CREATE UNIQUE INDEX "releases_github_release_id_key" ON "releases"("github_release_id");

-- CreateIndex
CREATE INDEX "releases_application_id_channel_id_status_idx" ON "releases"("application_id", "channel_id", "status");

-- CreateIndex
CREATE INDEX "releases_application_id_semver_major_semver_minor_semver_patch_idx" ON "releases"("application_id", "semver_major" DESC, "semver_minor" DESC, "semver_patch" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "releases_application_id_channel_id_version_key" ON "releases"("application_id", "channel_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "release_assets_github_asset_id_key" ON "release_assets"("github_asset_id");

-- CreateIndex
CREATE INDEX "release_assets_release_id_is_installable_idx" ON "release_assets"("release_id", "is_installable");

-- CreateIndex
CREATE UNIQUE INDEX "catalogue_revisions_revision_number_key" ON "catalogue_revisions"("revision_number");

-- CreateIndex
CREATE INDEX "catalogue_revisions_is_active_idx" ON "catalogue_revisions"("is_active");

-- CreateIndex
CREATE INDEX "catalogue_revisions_revision_number_idx" ON "catalogue_revisions"("revision_number" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_delivery_id_key" ON "webhook_events"("delivery_id");

-- CreateIndex
CREATE INDEX "webhook_events_delivery_id_idx" ON "webhook_events"("delivery_id");

-- CreateIndex
CREATE INDEX "webhook_events_status_created_at_idx" ON "webhook_events"("status", "created_at");

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_connections" ADD CONSTRAINT "repository_connections_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_compatibilities" ADD CONSTRAINT "platform_compatibilities_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_repository_connection_id_fkey" FOREIGN KEY ("repository_connection_id") REFERENCES "repository_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "release_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_assets" ADD CONSTRAINT "release_assets_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_assets" ADD CONSTRAINT "release_assets_platform_compatibility_id_fkey" FOREIGN KEY ("platform_compatibility_id") REFERENCES "platform_compatibilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_revisions" ADD CONSTRAINT "catalogue_revisions_published_by_admin_id_fkey" FOREIGN KEY ("published_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_repository_connection_id_fkey" FOREIGN KEY ("repository_connection_id") REFERENCES "repository_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_policies" ADD CONSTRAINT "notification_policies_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
