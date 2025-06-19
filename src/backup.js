// Système de backup automatique
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class BackupManager {
  constructor(projectPath, backupDir = null) {
    this.projectPath = projectPath;
    this.backupDir = backupDir || path.join(require('os').homedir(), '.syncteam', 'backups');
    this.maxBackups = 10;
    this.backupInterval = 30 * 60 * 1000; // 30 minutes
    this.isRunning = false;
    
    this.ensureBackupDir();
  }

  // S'assurer que le dossier de backup existe
  ensureBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  // Démarrer les backups automatiques
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🔄 Backup automatique démarré');
    
    // Backup immédiat
    this.createBackup();
    
    // Backup périodique
    this.backupTimer = setInterval(() => {
      this.createBackup();
    }, this.backupInterval);
  }

  // Arrêter les backups automatiques
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
    console.log('⏹️ Backup automatique arrêté');
  }

  // Créer un backup
  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const projectName = path.basename(this.projectPath);
      const backupName = `${projectName}_${timestamp}`;
      const backupPath = path.join(this.backupDir, backupName);

      console.log(`💾 Création backup: ${backupName}`);

      // Copier le projet
      await this.copyProject(this.projectPath, backupPath);

      // Créer un fichier de métadonnées
      const metadata = {
        projectPath: this.projectPath,
        backupDate: new Date().toISOString(),
        fileCount: await this.countFiles(backupPath),
        size: await this.getDirectorySize(backupPath)
      };

      fs.writeFileSync(
        path.join(backupPath, '.backup-metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      // Nettoyer les anciens backups
      await this.cleanOldBackups();

      console.log(`✅ Backup créé: ${backupName}`);
      return backupPath;

    } catch (error) {
      console.error('❌ Erreur backup:', error);
      throw error;
    }
  }

  // Copier le projet (en excluant certains dossiers)
  async copyProject(source, destination) {
    const excludePatterns = [
      'node_modules',
      '.git',
      '.syncteam',
      'dist',
      'build',
      '.cache',
      '.temp'
    ];

    const copyRecursive = (src, dest) => {
      const stat = fs.statSync(src);
      
      if (stat.isDirectory()) {
        const dirName = path.basename(src);
        
        // Exclure certains dossiers
        if (excludePatterns.includes(dirName)) {
          return;
        }
        
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        
        const files = fs.readdirSync(src);
        files.forEach(file => {
          copyRecursive(path.join(src, file), path.join(dest, file));
        });
      } else {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.copyFileSync(src, dest);
      }
    };

    copyRecursive(source, destination);
  }

  // Compter les fichiers dans un dossier
  async countFiles(dirPath) {
    let count = 0;
    
    const countRecursive = (dir) => {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          countRecursive(fullPath);
        } else {
          count++;
        }
      });
    };
    
    countRecursive(dirPath);
    return count;
  }

  // Calculer la taille d'un dossier
  async getDirectorySize(dirPath) {
    let size = 0;
    
    const sizeRecursive = (dir) => {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          sizeRecursive(fullPath);
        } else {
          size += stat.size;
        }
      });
    };
    
    sizeRecursive(dirPath);
    return size;
  }

  // Nettoyer les anciens backups
  async cleanOldBackups() {
    try {
      const backups = fs.readdirSync(this.backupDir)
        .filter(name => fs.statSync(path.join(this.backupDir, name)).isDirectory())
        .map(name => ({
          name,
          path: path.join(this.backupDir, name),
          created: fs.statSync(path.join(this.backupDir, name)).birthtime
        }))
        .sort((a, b) => b.created - a.created);

      // Supprimer les backups en excès
      const toDelete = backups.slice(this.maxBackups);
      
      for (const backup of toDelete) {
        fs.rmSync(backup.path, { recursive: true, force: true });
        console.log(`🗑️ Backup supprimé: ${backup.name}`);
      }

    } catch (error) {
      console.error('Erreur nettoyage backups:', error);
    }
  }

  // Restaurer un backup
  async restoreBackup(backupName, restorePath) {
    try {
      const backupPath = path.join(this.backupDir, backupName);
      
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup non trouvé: ${backupName}`);
      }

      console.log(`🔄 Restauration: ${backupName} vers ${restorePath}`);

      // Copier le backup vers le dossier de restauration
      await this.copyProject(backupPath, restorePath);

      console.log(`✅ Restauration terminée: ${backupName}`);
      return true;

    } catch (error) {
      console.error('❌ Erreur restauration:', error);
      throw error;
    }
  }

  // Lister les backups disponibles
  listBackups() {
    try {
      return fs.readdirSync(this.backupDir)
        .filter(name => fs.statSync(path.join(this.backupDir, name)).isDirectory())
        .map(name => {
          const backupPath = path.join(this.backupDir, name);
          const metadataPath = path.join(backupPath, '.backup-metadata.json');
          
          let metadata = {};
          if (fs.existsSync(metadataPath)) {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          }
          
          return {
            name,
            path: backupPath,
            created: fs.statSync(backupPath).birthtime,
            ...metadata
          };
        })
        .sort((a, b) => new Date(b.created) - new Date(a.created));

    } catch (error) {
      console.error('Erreur liste backups:', error);
      return [];
    }
  }

  // Obtenir des statistiques de backup
  getStats() {
    const backups = this.listBackups();
    const totalSize = backups.reduce((sum, backup) => sum + (backup.size || 0), 0);
    
    return {
      totalBackups: backups.length,
      totalSize: this.formatBytes(totalSize),
      oldestBackup: backups.length > 0 ? backups[backups.length - 1].created : null,
      newestBackup: backups.length > 0 ? backups[0].created : null,
      isRunning: this.isRunning
    };
  }

  // Formater les bytes
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = BackupManager; 