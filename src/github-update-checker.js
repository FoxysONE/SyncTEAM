// Système de mise à jour automatique via GitHub
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

class GitHubUpdateChecker {
  constructor() {
    this.repoOwner = 'FoxysONE';
    this.repoName = 'SyncTEAM';
    this.repoUrl = `https://github.com/${this.repoOwner}/${this.repoName}.git`;
    this.apiUrl = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}`;
    this.currentCommit = this.getCurrentCommit();
    this.tempDir = path.join(__dirname, '..', 'temp-update');
  }

  // Obtenir le commit actuel
  getCurrentCommit() {
    try {
      const gitDir = path.join(__dirname, '..', '.git');
      if (fs.existsSync(gitDir)) {
        const headFile = path.join(gitDir, 'HEAD');
        if (fs.existsSync(headFile)) {
          const headContent = fs.readFileSync(headFile, 'utf8').trim();
          
          if (headContent.startsWith('ref: ')) {
            // Branch reference
            const refPath = headContent.substring(5);
            const refFile = path.join(gitDir, refPath);
            if (fs.existsSync(refFile)) {
              return fs.readFileSync(refFile, 'utf8').trim();
            }
          } else {
            // Direct commit hash
            return headContent;
          }
        }
      }
      
      // Fallback: essayer avec git command
      return this.getCommitWithGit();
    } catch (error) {
      console.warn('⚠️ Impossible de déterminer le commit actuel:', error.message);
      return null;
    }
  }

  // Obtenir le commit avec la commande git
  getCommitWithGit() {
    return new Promise((resolve, reject) => {
      const git = spawn('git', ['rev-parse', 'HEAD'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe'
      });

      let output = '';
      git.stdout.on('data', (data) => {
        output += data.toString();
      });

      git.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error('Git command failed'));
        }
      });

      git.on('error', reject);
    });
  }

  // Vérifier les mises à jour sur GitHub
  async checkForUpdates() {
    console.log('🔍 Vérification du dernier commit sur GitHub...');
    
    try {
      // Récupérer les informations du dernier commit
      const latestCommitInfo = await this.getLatestCommitFromGitHub();
      
      if (!this.currentCommit) {
        console.log('⚠️ Commit actuel inconnu, mise à jour recommandée');
        return {
          hasUpdate: true,
          latestCommit: latestCommitInfo.sha,
          commitMessage: latestCommitInfo.message,
          message: 'Mise à jour recommandée (version locale inconnue)',
          downloadUrl: `${this.repoUrl}/archive/main.zip`
        };
      }

      if (latestCommitInfo.sha !== this.currentCommit) {
        console.log(`🆕 Nouveau commit détecté: ${latestCommitInfo.sha.substring(0, 7)}`);
        return {
          hasUpdate: true,
          latestCommit: latestCommitInfo.sha,
          commitMessage: latestCommitInfo.message,
          message: `Nouvelle version disponible: ${latestCommitInfo.message}`,
          downloadUrl: `${this.repoUrl}/archive/main.zip`
        };
      }

      console.log('✅ Application à jour');
      return {
        hasUpdate: false,
        latestCommit: latestCommitInfo.sha,
        message: 'Application à jour'
      };

    } catch (error) {
      console.error('❌ Erreur vérification GitHub:', error);
      throw new Error(`Impossible de vérifier les mises à jour: ${error.message}`);
    }
  }

  // Récupérer le dernier commit depuis l'API GitHub
  getLatestCommitFromGitHub() {
    return new Promise((resolve, reject) => {
      const url = `${this.apiUrl}/commits/main`;
      
      console.log(`📡 Requête API: ${url}`);
      
      const request = https.get(url, {
        headers: {
          'User-Agent': 'SyncTEAM-UpdateChecker/1.0',
          'Accept': 'application/vnd.github.v3+json'
        }
      }, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            if (response.statusCode === 200) {
              const commitData = JSON.parse(data);
              resolve({
                sha: commitData.sha,
                message: commitData.commit.message,
                date: commitData.commit.author.date,
                author: commitData.commit.author.name
              });
            } else {
              reject(new Error(`GitHub API error: ${response.statusCode} - ${data}`));
            }
          } catch (parseError) {
            reject(new Error(`Erreur parsing JSON: ${parseError.message}`));
          }
        });
      });
      
      request.on('error', (error) => {
        reject(new Error(`Erreur requête: ${error.message}`));
      });
      
      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Timeout de la requête GitHub'));
      });
    });
  }

  // Télécharger la mise à jour
  async downloadUpdate() {
    console.log('📥 Téléchargement de la mise à jour depuis GitHub...');
    
    try {
      // Créer le dossier temporaire
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
      fs.mkdirSync(this.tempDir, { recursive: true });

      // Cloner le repository
      await this.cloneRepository();
      
      console.log('✅ Téléchargement terminé');
      return { success: true };
      
    } catch (error) {
      console.error('❌ Erreur téléchargement:', error);
      throw error;
    }
  }

  // Cloner le repository GitHub
  cloneRepository() {
    return new Promise((resolve, reject) => {
      console.log(`🔄 Clonage de ${this.repoUrl}...`);
      
      const git = spawn('git', [
        'clone',
        '--depth', '1',
        '--branch', 'main',
        this.repoUrl,
        this.tempDir
      ], {
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      git.stdout.on('data', (data) => {
        output += data.toString();
        console.log('Git:', data.toString().trim());
      });

      git.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.log('Git error:', data.toString().trim());
      });

      git.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Clonage terminé');
          resolve();
        } else {
          reject(new Error(`Git clone failed with code ${code}: ${errorOutput}`));
        }
      });

      git.on('error', (error) => {
        reject(new Error(`Git command error: ${error.message}`));
      });
    });
  }

  // Installer la mise à jour
  async installUpdate() {
    console.log('🚀 Installation de la mise à jour...');
    
    try {
      if (!fs.existsSync(this.tempDir)) {
        throw new Error('Aucune mise à jour téléchargée');
      }

      const appDir = path.join(__dirname, '..');
      
      // Sauvegarder les fichiers importants
      await this.backupImportantFiles();
      
      // Copier les nouveaux fichiers
      await this.copyUpdateFiles(this.tempDir, appDir);
      
      // Installer les nouvelles dépendances
      await this.installDependencies();
      
      // Nettoyer
      fs.rmSync(this.tempDir, { recursive: true, force: true });
      
      console.log('✅ Mise à jour installée avec succès');
      return { success: true };
      
    } catch (error) {
      console.error('❌ Erreur installation:', error);
      throw error;
    }
  }

  // Sauvegarder les fichiers importants
  async backupImportantFiles() {
    const backupDir = path.join(__dirname, '..', 'backup-before-update');
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
    fs.mkdirSync(backupDir, { recursive: true });

    // Fichiers à sauvegarder
    const filesToBackup = [
      'package.json',
      'package-lock.json',
      '.env',
      'config.json'
    ];

    for (const file of filesToBackup) {
      const srcPath = path.join(__dirname, '..', file);
      const destPath = path.join(backupDir, file);
      
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`💾 Sauvegardé: ${file}`);
      }
    }
  }

  // Copier les fichiers de mise à jour
  async copyUpdateFiles(srcDir, destDir) {
    const filesToSkip = [
      '.git',
      'node_modules',
      'backup-before-update',
      'temp-update',
      '.env',
      'config.json'
    ];

    this.copyRecursive(srcDir, destDir, filesToSkip);
  }

  // Copie récursive avec exclusions
  copyRecursive(src, dest, skipList = []) {
    const items = fs.readdirSync(src);
    
    for (const item of items) {
      if (skipList.includes(item)) continue;
      
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      const stat = fs.statSync(srcPath);
      
      if (stat.isDirectory()) {
        if (!fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true });
        }
        this.copyRecursive(srcPath, destPath, skipList);
      } else {
        fs.copyFileSync(srcPath, destPath);
        console.log(`📄 Copié: ${item}`);
      }
    }
  }

  // Installer les dépendances
  installDependencies() {
    return new Promise((resolve, reject) => {
      console.log('📦 Installation des dépendances...');
      
      const npm = spawn('npm', ['install'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe'
      });

      npm.stdout.on('data', (data) => {
        console.log('NPM:', data.toString().trim());
      });

      npm.stderr.on('data', (data) => {
        console.log('NPM error:', data.toString().trim());
      });

      npm.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Dépendances installées');
          resolve();
        } else {
          reject(new Error(`npm install failed with code ${code}`));
        }
      });

      npm.on('error', reject);
    });
  }

  // Obtenir les informations de version
  getVersionInfo() {
    return {
      currentCommit: this.currentCommit,
      repoUrl: this.repoUrl,
      lastCheck: new Date().toISOString()
    };
  }
}

module.exports = GitHubUpdateChecker; 