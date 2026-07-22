import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("legacy fork migration ledger repair", (it) => {
  it.effect("removes duplicated fork IDs and runs the canonical upstream migration", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 32 });
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES
          (33, 'ProjectionThreadShellArchiveIndexes'),
          (34, 'AuthAuthorizationScopes'),
          (35, 'AuthPairingProofKeyThumbprint')
      `;

      yield* runMigrations();

      const migrations = yield* sql<{
        readonly migration_id: number;
        readonly name: string;
      }>`
        SELECT migration_id, name
        FROM effect_sql_migrations
        WHERE migration_id >= 31
        ORDER BY migration_id
      `;
      assert.deepStrictEqual(migrations, [
        { migration_id: 31, name: "AuthAuthorizationScopes" },
        { migration_id: 32, name: "AuthPairingProofKeyThumbprint" },
        { migration_id: 33, name: "ProjectionThreadsSettled" },
      ]);

      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;
      assert.isTrue(columns.some((column) => column.name === "settled_override"));
      assert.isTrue(columns.some((column) => column.name === "settled_at"));
    }),
  );

  it.effect("canonicalizes the native fork ledger before running upstream migration 33", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 32 });
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`DELETE FROM effect_sql_migrations WHERE migration_id >= 23`;
          yield* sql`
            INSERT INTO effect_sql_migrations (migration_id, name)
            VALUES
              (23, 'NormalizeLegacyProviderKinds'),
              (24, 'RepairProjectionThreadProposedPlanImplementationColumns'),
              (25, 'ProjectionThreadShellSummary'),
              (26, 'BackfillProjectionThreadShellSummary'),
              (27, 'CleanupInvalidProjectionPendingApprovals'),
              (28, 'CanonicalizeModelSelectionOptions'),
              (29, 'ProviderSessionRuntimeInstanceId'),
              (30, 'ProjectionThreadSessionInstanceId'),
              (31, 'BackfillForkProviderInstanceIds'),
              (32, 'ProjectionThreadDetailOrderingIndexes'),
              (33, 'ProjectionThreadShellArchiveIndexes'),
              (34, 'AuthAuthorizationScopes'),
              (35, 'AuthPairingProofKeyThumbprint')
          `;
        }),
      );

      yield* runMigrations();

      const migrations = yield* sql<{
        readonly migration_id: number;
        readonly name: string;
      }>`
        SELECT migration_id, name
        FROM effect_sql_migrations
        WHERE migration_id >= 23
        ORDER BY migration_id
      `;
      assert.deepStrictEqual(migrations, [
        { migration_id: 23, name: "ProjectionThreadShellSummary" },
        { migration_id: 24, name: "BackfillProjectionThreadShellSummary" },
        { migration_id: 25, name: "CleanupInvalidProjectionPendingApprovals" },
        { migration_id: 26, name: "CanonicalizeModelSelectionOptions" },
        { migration_id: 27, name: "ProviderSessionRuntimeInstanceId" },
        { migration_id: 28, name: "ProjectionThreadSessionInstanceId" },
        { migration_id: 29, name: "ProjectionThreadDetailOrderingIndexes" },
        { migration_id: 30, name: "ProjectionThreadShellArchiveIndexes" },
        { migration_id: 31, name: "AuthAuthorizationScopes" },
        { migration_id: 32, name: "AuthPairingProofKeyThumbprint" },
        { migration_id: 33, name: "ProjectionThreadsSettled" },
      ]);
    }),
  );
});
