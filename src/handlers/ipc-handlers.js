// Handlers IPC centralisés et optimisés
const { dialog, shell, app } = require('electron');
const { instance: ipcManager } = require('../ipc-manager');
const { instance: errorHandler } = require('../error-handler');
const GitHubUpdateChecker = require('../github-update-checker');
const BackupManager = require('../backup');

class IPCHandlers {
  constructor(app) {
    this.app = app;
    this.setupAllHandlers();
  }
  
  setupAllHandlers() {
    console.log('🔗 Configuration des handlers IPC optimisés...');
    
    this.setupProjectHandlers();
    this.setupUpdateHandlers();
    this.setupLiveCodingHandlers();
    this.setupConfigHandlers();
    this.setupNetworkHandlers();
    
    console.log(`✅ ${ipcManager.getStats().handlers} handlers IPC configurés`);
  }
  
  setupProjectHandlers() {
    // Sélectionner un dossier de projet
    ipcManager.handle('select-project-folder', async () => {
      try {
        const result = await dialog.showOpenDialog(this.app.mainWindow, {
          properties: ['openDirectory'],
          title: 'Sélectionner le dossier du projet à synchroniser'
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
          this.app.projectPath = result.filePaths[0];
          this.app.scanProjectFiles();
          
          // Initialiser le backup pour ce projet
          this.app.backup = new BackupManager(this.app.projectPath);
          
          // Analyser le code avec l'IA
          this.app.analyzeProjectWithAI();
          
          console.log(`📁 Projet sélectionné: ${this.app.projectPath}`);
          
          return { 
            success: true, 
            path: this.app.projectPath,
            fileCount: this.app.projectFiles.size
          };
        }
        
        return { 
          success: false, 
          error: 'Aucun dossier sélectionné' 
        };
        
      } catch (error) {
        errorHandler.handleError('ProjectSelector', error);
        return { 
          success: false, 
          error: error.message 
        };
      }
    });
    
    // Ouvrir le dossier du projet
    ipcManager.handle('open-project-folder', async () => {
      try {
        if (!this.app.projectPath) {
          return { success: false, error: 'Aucun projet sélectionné' };
        }
        
        await shell.openPath(this.app.projectPath);
        
        return { 
          success: true, 
          message: 'Dossier ouvert dans l\'explorateur' 
        };
        
      } catch (error) {
        errorHandler.handleError('ProjectOpener', error);
        return { 
          success: false, 
          error: error.message 
        };
      }
    });
  }
  
  setupUpdateHandlers() {
    // Vérification des mises à jour
    ipcManager.handle('check-for-updates', async () => {
      try {
        console.log('🔍 Vérification des mises à jour...');
        const updateChecker = new GitHubUpdateChecker();
        const updateInfo = await updateChecker.checkForUpdates();
        
        if (updateInfo.hasUpdate) {
          console.log(`🆕 Mise à jour disponible: ${updateInfo.latestCommit?.substring(0, 7)}`);
          return {
            success: true,
            hasUpdate: true,
            version: updateInfo.latestCommit?.substring(0, 7) || 'unknown',
            message: updateInfo.message,
            releaseNotes: updateInfo.commitMessage,
            downloadUrl: updateInfo.downloadUrl
          };
        } else {
          console.log('✅ Application à jour');
          return {
            success: true,
            hasUpdate: false,
            message: 'Application à jour'
          };
        }
      } catch (error) {
        errorHandler.handleError('UpdateChecker', error);
        return {
          success: false,
          error: error.message,
          hasUpdate: false
        };
      }
    });
    
    // Téléchargement des mises à jour
    ipcManager.handle('download-update', async () => {
      try {
        console.log('📥 Téléchargement de la mise à jour...');
        const updateChecker = new GitHubUpdateChecker();
        const result = await updateChecker.downloadUpdate();
        
        return { 
          success: true, 
          message: 'Téléchargement terminé',
          data: result
        };
      } catch (error) {
        errorHandler.handleError('UpdateDownloader', error);
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    // Installation des mises à jour
    ipcManager.handle('install-update', async () => {
      try {
        console.log('🚀 Installation de la mise à jour...');
        const updateChecker = new GitHubUpdateChecker();
        await updateChecker.installUpdate();
        
        // Redémarrer l'application après un délai
        setTimeout(() => {
          app.relaunch();
          app.exit();
        }, 2000);
        
        return { 
          success: true,
          message: 'Installation réussie, redémarrage en cours...'
        };
      } catch (error) {
        errorHandler.handleError('UpdateInstaller', error);
        return {
          success: false,
          error: error.message
        };
      }
    });
  }
  
  setupLiveCodingHandlers() {
    // Démarrer une session live coding
    ipcManager.handle('start-live-session', async (event, options = {}) => {
      try {
        if (!this.app.projectPath) {
          return { success: false, error: 'Aucun projet sélectionné' };
        }

        // Générer un ID de session et mot de passe
        this.app.sessionId = `live_${Date.now()}`;
        this.app.sessionPassword = this.app.auth.createSecureSession(this.app.sessionId);
        
        // Configuration du serveur avec NetworkManager
        const serverConfig = this.app.networkManager.getServerConfig();
        await this.app.startOptimizedServer(serverConfig);
        
        // Enregistrer le serveur dans NetworkManager
        this.app.networkManager.registerServer('live-server', this.app.syncServer);
        
        // Initialiser le moteur de live sync
        this.app.liveSyncEngine.addClient(this.app.clientId, this.app.userName);
        this.app.initializeProjectDocuments();
        
        this.app.isHost = true;
        this.app.isConnected = true;
        this.app.setupFileWatcher();
        
        // Démarrer le backup automatique
        if (this.app.backup) {
          this.app.backup.start();
        }
        
        console.log(`🔥 Session live coding démarrée: ${this.app.sessionId}`);
        console.log(`🔑 Mot de passe: ${this.app.sessionPassword}`);
        
        return { 
          success: true, 
          sessionId: this.app.sessionId,
          password: this.app.sessionPassword,
          serverConfig: serverConfig,
          addresses: serverConfig.interfaces,
          message: `Session live démarrée - ID: ${this.app.sessionId}` 
        };
        
      } catch (error) {
        errorHandler.handleError('LiveSession', error);
        this.app.stats.recordError();
        return { success: false, error: error.message };
      }
    });
    
    // Rejoindre une session live coding
    ipcManager.handle('join-live-session', async (event, sessionInfo) => {
      try {
        const { sessionId, password } = sessionInfo;
        
        if (!sessionId || !password) {
          return { success: false, error: 'ID de session ou mot de passe manquant' };
        }
        
        // Vérifier la session
        if (!this.app.auth.validateSession(sessionId, password)) {
          return { success: false, error: 'Session invalide ou mot de passe incorrect' };
        }
        
        // Logic de connexion...
        this.app.isConnected = true;
        
        return { 
          success: true, 
          message: `Connecté à la session ${sessionId}` 
        };
        
      } catch (error) {
        errorHandler.handleError('JoinSession', error);
        return { success: false, error: error.message };
      }
    });
    
    // Connecter à un hôte
    ipcManager.handle('connect-to-host', async (event, { ip, sessionId, password }) => {
      try {
        if (!ip) {
          return { success: false, error: 'Adresse IP manquante' };
        }
        
        // Tester la connectivité avec NetworkManager
        const connectivityTest = await this.app.networkManager.testConnectivity(ip, 8080);
        
        if (!connectivityTest.success) {
          return { 
            success: false, 
            error: `Impossible de se connecter à ${ip}:8080 - ${connectivityTest.error}` 
          };
        }
        
        // Logic de connexion WebSocket...
        const result = await this.app.connectToLiveSession(ip, sessionId, password);
        
        if (result.success) {
          this.app.isConnected = true;
          console.log(`✅ Connecté à ${ip} (latence: ${connectivityTest.latency}ms)`);
        }
        
        return result;
        
      } catch (error) {
        errorHandler.handleError('HostConnection', error);
        return { success: false, error: error.message };
      }
    });
    
    // Déconnecter
    ipcManager.handle('disconnect', async () => {
      try {
        await this.app.disconnect();
        
        return { 
          success: true, 
          message: 'Déconnexion réussie' 
        };
      } catch (error) {
        errorHandler.handleError('Disconnect', error);
        return { success: false, error: error.message };
      }
    });
  }
  
  setupConfigHandlers() {
    // Obtenir la configuration
    ipcManager.handle('get-config', async () => {
      try {
        const config = this.app.configManager.getConfig();
        const networkStats = this.app.networkManager.getNetworkStats();
        
        return {
          success: true,
          config: config,
          networkStats: networkStats
        };
      } catch (error) {
        errorHandler.handleError('ConfigGetter', error);
        return { success: false, error: error.message };
      }
    });
    
    // Mettre à jour la configuration
    ipcManager.handle('update-config', async (event, configUpdate) => {
      try {
        const result = await this.app.configManager.updateConfig(configUpdate);
        
        if (result) {
          this.app.applyConfigChanges(configUpdate);
          
          return { 
            success: true, 
            message: 'Configuration mise à jour' 
          };
        } else {
          return { 
            success: false, 
            error: 'Échec de la mise à jour de la configuration' 
          };
        }
      } catch (error) {
        errorHandler.handleError('ConfigUpdater', error);
        return { success: false, error: error.message };
      }
    });
  }
  
  setupNetworkHandlers() {
    // Basculer le mode réseau
    ipcManager.handle('toggle-network-mode', async () => {
      try {
        const currentMode = this.app.networkManager.currentMode;
        const newMode = currentMode === 'local' ? 'network' : 'local';
        
        const result = await this.app.networkManager.switchMode(newMode);
        
        console.log(`🔄 Mode réseau changé: ${currentMode} → ${newMode}`);
        
        // Notifier l'interface du changement
        this.app.sendToRenderer('network-mode-changed', {
          mode: newMode,
          config: result.config,
          interfaces: result.config.interfaces
        });
        
        return {
          success: true,
          oldMode: currentMode,
          newMode: newMode,
          config: result.config,
          message: `Mode ${newMode} activé`
        };
      } catch (error) {
        errorHandler.handleError('NetworkToggle', error);
        return { success: false, error: error.message };
      }
    });
    
    // Obtenir les statistiques
    ipcManager.handle('get-stats', async () => {
      try {
        const appStats = this.app.stats.getReport();
        const ipcStats = ipcManager.getStats();
        const networkStats = this.app.networkManager.getNetworkStats();
        const errorStats = errorHandler.getErrorStats();
        
        return {
          success: true,
          stats: {
            app: appStats,
            ipc: ipcStats,
            network: networkStats,
            errors: errorStats
          }
        };
      } catch (error) {
        errorHandler.handleError('StatsGetter', error);
        return { success: false, error: error.message };
      }
    });
  }
}

module.exports = IPCHandlers; 