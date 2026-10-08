#!/usr/bin/env node
/**
 * scripts/run-backup.js
 * 
 * CLI tool to execute manual or scheduled backups
 * Usage: node scripts/run-backup.js [--trigger=MANUAL]
 */

const { runFullBackup, listAvailableBackups } = require('../backupService');

async function main() {
    const args = process.argv.slice(2);
    const triggerArg = args.find(a => a.startsWith('--trigger='));
    const trigger = triggerArg ? triggerArg.split('=')[1] : 'CLI_MANUAL';

    console.log("Starting Backup Execution...");
    const result = await runFullBackup({ trigger });

    if (result.success) {
        console.log("\n Backup Completed Successfully!");
        console.log(`Snapshot ID : ${result.backupId}`);
        console.log(`Location    : ${result.path}`);
        console.log(`Tables      : ${Object.keys(result.manifest.database.tables).length} tables (${result.manifest.database.total_records} records)`);
        console.log(`Documents   : ${result.manifest.storage.downloaded_files} files`);
        
        console.log("\nRecent Snapshots Available:");
        const list = listAvailableBackups().slice(0, 5);
        list.forEach((b, i) => {
            console.log(` ${i + 1}. ${b.id} (${b.created_at}) - ${b.total_records} records, ${b.total_docs} docs`);
        });
        process.exit(0);
    } else {
        console.error("\n Backup Failed:", result.error);
        process.exit(1);
    }
}

main();
