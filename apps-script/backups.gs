/**
 * Intent Collective: daily backups of the website's Google Sheets.
 *
 * Standalone Apps Script project "db_backups" in the IC Google Drive (not
 * attached to any spreadsheet). Copies each sheet into one private Drive
 * folder every night (about 3 AM Eastern) and deletes copies older than
 * KEEP_DAYS.
 * Keep your real IDs only inside the Apps Script editor. The deployed copy
 * backs up five sheets: Discourse, henry portfolio, Zeitgeist, Debate
 * Schedule, and the private Fellows and Subscribers (added Nov 13 2026).
 */

const BACKUP_FOLDER_ID = 'PASTE_BACKUP_FOLDER_ID';

// Backups older than this many days are moved to the trash.
const KEEP_DAYS = 15;

// Email you once if any backup fails.
const EMAIL_ON_FAILURE = true;

const SHEET_IDS = [
  'PASTE_DISCOURSE_SHEET_ID',
  'PASTE_PORTFOLIO_SHEET_ID',
  'PASTE_ZEITGEIST_SHEET_ID',
  'PASTE_DEBATE_SCHEDULE_SHEET_ID',
  'PASTE_FELLOWS_AND_SUBSCRIBERS_SHEET_ID'
];

function backupAllSheets() {
  const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm');
  const failures = [];

  SHEET_IDS.forEach(id => {
    try {
      if (id.indexOf('PASTE_') === 0) throw new Error('ID not filled in');
      const src = DriveApp.getFileById(id);
      src.makeCopy(src.getName() + ' backup ' + stamp, folder);
    } catch (err) {
      console.error('Backup failed for ' + id + ': ' + err);
      failures.push(id + ': ' + err);
    }
  });

  // Delete backups older than KEEP_DAYS.
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getName().indexOf(' backup ') > -1 && f.getDateCreated().getTime() < cutoff) {
      f.setTrashed(true);
    }
  }

  if (failures.length && EMAIL_ON_FAILURE) {
    try {
      MailApp.sendEmail(
        Session.getEffectiveUser().getEmail(),
        'Intent Collective backup problem',
        'These sheets were not backed up on ' + stamp + ':\n\n' + failures.join('\n')
      );
    } catch (mailErr) {
      console.error('Could not send the failure email: ' + mailErr);
    }
  }
}

// Run once by hand BEFORE installing the schedule.
function testBackupTargets() {
  try {
    Logger.log('Backup folder: ' + DriveApp.getFolderById(BACKUP_FOLDER_ID).getName());
  } catch (err) {
    Logger.log('Backup folder problem: ' + err);
  }
  SHEET_IDS.forEach(id => {
    try {
      Logger.log('OK: ' + DriveApp.getFileById(id).getName());
    } catch (err) {
      Logger.log('PROBLEM with ' + id + ': ' + err);
    }
  });
}

// Run once manually to set up the nightly schedule (about 3 AM).
function installBackupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'backupAllSheets')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupAllSheets').timeBased().everyDays(1).atHour(3).create();
}
