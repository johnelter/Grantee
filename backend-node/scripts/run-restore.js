#!/usr/bin/env node
/**
 * scripts/run-restore.js
 * 
 * CLI tool to execute database and storage restoration from a backup snapshot.
 * Usage:
 *   node scripts/run-restore.js --snapshot=snapshot_2026-10-08T04-50-00-000Z [--dry-run]
 *   node scripts/run-restore.js --latest [--dry-run]
 */

const { restoreBackup, listAvailableBackups } = require('../backupService');

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const isLatest = args.includes('--latest');
    const snapArg = args.find(a => a.startsWith('--snapshot='));

    let targetSnapshot = snapArg ? snapArg.split('=')[1] : null;

    const available = listAvailableBackups();
    if (available.length === 0) {
        console.error("No backup snapshots found in backups directory.");
        process.exit(1);
    }

    if (isLatest || !targetSnapshot) {
        targetSnapshot = available[0].id;
        console.log(`Auto-selected latest snapshot: ${targetSnapshot}`);
    }

    console.log(`Starting Restoration Process for: ${targetSnapshot}`);
    if (dryRun) console.log(">>> DRY-RUN MODE: No database records will be modified. <<<");

    try {
        const report = await restoreBackup(targetSnapshot, { dryRun });
        console.log("\n================================================================");
        console.log(" RESTORATION SUMMARY REPORT");
        console.log("================================================================");
        console.log(`Snapshot Restored : ${report.backup_id}`);
        console.log(`Execution Mode    : ${report.dryRun ? 'Dry-Run Simulation' : 'Live Data Commit'}`);
        console.log(`Execution Time    : ${report.restored_at}`);
        console.log(`Tables Restored   :`);
        for (const [table, count] of Object.entries(report.tables_restored)) {
            console.log(`  - ${table.padEnd(22)}: ${count} records`);
        }
        console.log(`Documents Synced  : ${report.documents_synced} files`);
        console.log("================================================================\n");
        process.exit(0);
    } catch (err) {
        console.error("\n Restoration Error:", err.message);
        process.exit(1);
    }
}

main();
