// syncTEAM - Application principale refactorisée et optimisée
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// 🔥 MODULES OPTIMISÉS
const { instance: errorHandler } = require('./error-handler');
const { instance: ipcManager } = require('./ipc-manager');
const NetworkManager = require('./network-manager');
const IPCHandlers = require('./handlers/ipc-handlers');
const ConfigManager = require('./config');
const LiveSyncEngine = require('./live-sync');
const ConflictResolver = require('./conflict-resolver');
const OptimizedWebSocket = require('./ws-optimized');
const AICodeAssistant = require('./ai-assistant');
const AuthManager = require('./auth');
const StatsManager = require('./stats');
const BackupManager = require('./backup');
const GitHubUpdateChecker = require('./github-update-checker');

class SyncTeamApp {
  constructor() {
    console.log('🚀 Initialisation syncTEAM optimisé...');
    
    // État de l'application
    this.mainWindow = null;
    this.projectPath = '';
    this.projectFiles = new Map();
    this.isHost = false;
    this.isConnected = false;
    this.watchers = [];
    this.syncServer = null;
    
    // Configuration de l'utilisateur
    this.clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.userName = 'Utilisateur';
    this.userColor = this.generateUserColor();
    
    // Session de live coding
    this.sessionId = null;
    this.sessionPassword = null;
    this.collaborators = new Map();
    
    // 🔧 INITIALISATION DES MODULES
    this.initializeModules();
    this.setupErrorHandling();
    this.setupApplication();
  }
  
  // Initialiser tous les modules
  initializeModules() {
    try {
      this.configManager = new ConfigManager();
      this.networkManager = new NetworkManager(this.configManager);
      this.liveSyncEngine = new LiveSyncEngine(this.configManager);
      this.conflictResolver = new ConflictResolver();
      this.aiAssistant = new AICodeAssistant();
      this.auth = new AuthManager();
      this.stats = new StatsManager();
      this.backup = null; // Initialisé avec le projet
      this.wsOptimized = null;
      
      console.log('✅ Modules initialisés avec succès');
    } catch (error) {
      errorHandler.handleCriticalError('ModuleInitialization', error);
    }
  }
  
  // Configuration de la gestion d'erreurs
  setupErrorHandling() {
    errorHandler.addListener((errorInfo) => {
      if (this.mainWindow) {
        this.sendToRenderer('error-notification', errorInfo);
      }
    });
    
    // Middlewares IPC
    ipcManager.addMiddleware(ipcManager.createRateLimitMiddleware(50, 60000));
    ipcManager.addMiddleware(ipcManager.createIPValidationMiddleware());
    
    console.log('✅ Gestion d\'erreurs configurée');
  }
  
  // Configuration de l'application
  setupApplication() {
    // Événements de l'application
    app.whenReady().then(() => {
      this.createWindow();
      this.setupAutoUpdater();
      this.setupLiveSyncEvents();
    });
    
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });
  }
  
  // Créer la fenêtre principale
  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1600,
      height: 1000,
      minWidth: 1200,
      minHeight: 800,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false
      },
      titleBarStyle: 'default',
      show: false,
      backgroundColor: '#0d1117',
      title: 'syncTEAM - Live Coding Platform v2.1.0'
    });

    this.mainWindow.loadFile('src/renderer/index.html');
    
    // Afficher la fenêtre quand elle est prête
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      
      // Envoyer la configuration initiale
      this.sendToRenderer('config_loaded', this.configManager.export());
      this.sendToRenderer('client_info', {
        clientId: this.clientId,
        userName: this.userName,
        color: this.userColor
      });
    });

    // Configuration des handlers IPC
    this.setupIpcHandlers();
    
    // Dev tools en mode développement
    if (process.argv.includes('--dev')) {
      this.mainWindow.webContents.openDevTools();
    }
  }
  
  // Configuration des handlers IPC
  setupIpcHandlers() {
    console.log('🔗 Configuration des handlers IPC...');
    
    // Initialiser les handlers centralisés
    this.ipcHandlers = new IPCHandlers(this);
    
    console.log(`✅ Handlers IPC configurés`);
  }
  
  // Configuration de l'auto-updater
  setupAutoUpdater() {
    console.log('🔄 Configuration auto-updater...');
    
    // Vérification automatique au démarrage
    setTimeout(async () => {
      try {
        const updateChecker = new GitHubUpdateChecker();
        const updateInfo = await updateChecker.checkForUpdates();
        
        if (updateInfo.hasUpdate) {
          this.sendToRenderer('update-available', updateInfo);
        } else {
          this.sendToRenderer('update-not-available');
        }
      } catch (error) {
        errorHandler.handleError('AutoUpdater', error);
      }
    }, 5000);
  }
  
  // Configuration des événements live sync
  setupLiveSyncEvents() {
    this.liveSyncEngine.on('operations_batch', (batch) => {
      this.broadcastLiveBatch(batch);
    });
    
    this.liveSyncEngine.on('presence_update', (presenceList) => {
      this.sendToRenderer('presence_update', presenceList);
    });
    
    this.aiAssistant.on('suggestion', (suggestion) => {
      this.sendToRenderer('ai_suggestion', suggestion);
    });
  }
  
  // 🚀 SERVEUR LIVE CODING OPTIMISÉ
  async startOptimizedServer(serverConfig = null) {
    try {
      const config = serverConfig || this.networkManager.getServerConfig();
      
      console.log(`🚀 Démarrage serveur [${config.mode}]: ${config.host}:${config.port}`);
      
      // Créer le serveur WebSocket
      const WebSocket = require('ws');
      this.syncServer = new WebSocket.Server({
        host: config.host,
        port: config.port,
        maxPayload: 10 * 1024 * 1024 // 10MB max
      });
      
      // Gestion des connexions
      this.syncServer.on('connection', (ws, request) => {
        this.handleNewConnection(ws, request);
      });
      
      this.syncServer.on('error', (error) => {
        errorHandler.handleError('LiveServer', error);
      });
      
      // Enregistrer le serveur dans NetworkManager
      this.networkManager.registerServer('live-server', this.syncServer);
      
      console.log(`✅ Serveur live coding démarré sur ${config.host}:${config.port}`);
      
      return { success: true, config };
      
    } catch (error) {
      errorHandler.handleError('ServerStart', error);
      throw error;
    }
  }
  
  // Gestion des nouvelles connexions
  handleNewConnection(ws, request) {
    const clientIP = request.socket.remoteAddress;
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    console.log(`🔗 Nouvelle connexion: ${clientId} (${clientIP})`);
    
    // Configuration du client
    ws.clientId = clientId;
    ws.isAlive = true;
    ws.lastSeen = Date.now();
    
    // Événements WebSocket
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleLiveMessage(ws, message);
      } catch (error) {
        errorHandler.handleWarning('MessageParsing', 'Message JSON invalide');
      }
    });
    
    ws.on('close', () => {
      console.log(`👋 Client déconnecté: ${clientId}`);
      this.handleClientDisconnect(ws);
    });
    
    ws.on('error', (error) => {
      errorHandler.handleError('WebSocketClient', error);
    });
    
    // Mettre à jour les statistiques
    this.stats.recordConnection();
    this.stats.updateClientCount(this.syncServer.clients.size);
  }
  
  // Gestion des messages live
  handleLiveMessage(ws, message) {
    try {
      switch (message.type) {
        case 'auth':
          this.handleLiveAuth(ws, message);
          break;
        case 'operation':
          this.handleLiveOperation(ws, message);
          break;
        default:
          console.log(`📨 Message non géré: ${message.type}`);
      }
    } catch (error) {
      errorHandler.handleError('LiveMessage', error);
    }
  }
  
  // Authentification live
  handleLiveAuth(ws, message) {
    const { sessionId, password } = message.data;
    
    if (this.auth.validateSession(sessionId, password)) {
      ws.authenticated = true;
      ws.sessionId = sessionId;
      
      ws.send(JSON.stringify({
        type: 'auth_success',
        data: { clientId: ws.clientId }
      }));
      
      console.log(`✅ Client authentifié: ${ws.clientId}`);
    } else {
      ws.send(JSON.stringify({
        type: 'auth_failed',
        data: { error: 'Session invalide' }
      }));
      
      ws.close();
    }
  }
  
  // Gestion des opérations live
  handleLiveOperation(ws, message) {
    if (!ws.authenticated) return;
    
    const success = this.liveSyncEngine.applyTextOperation(
      ws.clientId,
      message.data.fileName,
      message.data.operation
    );
    
    if (success) {
      this.stats.recordSync(
        message.data.fileName,
        message.data.operation.text?.length || 0,
        Date.now()
      );
      
      // Broadcaster à tous les autres clients
      this.broadcastToOthers(ws, {
        type: 'operation',
        data: message.data
      });
    }
  }
  
  // Broadcaster à tous les autres clients
  broadcastToOthers(excludeWs, message) {
    this.syncServer.clients.forEach(client => {
      if (client !== excludeWs && client.authenticated && client.readyState === 1) {
        client.send(JSON.stringify(message));
      }
    });
  }
  
  // Scanner les fichiers du projet
  scanProjectFiles() {
    if (!this.projectPath) return;
    
    console.log(`📁 Scan du projet: ${this.projectPath}`);
    this.projectFiles.clear();
    
    const scanDir = (dirPath, relativePath = '', depth = 0) => {
      if (depth > 10) return; // Limiter la profondeur
      
      try {
        const items = fs.readdirSync(dirPath);
        
        items.forEach(item => {
          if (this.shouldIgnoreFile(item)) return;
          
          const fullPath = path.join(dirPath, item);
          const relativeItemPath = path.join(relativePath, item).replace(/\\/g, '/');
          
          try {
            const stats = fs.statSync(fullPath);
            
            if (stats.isDirectory()) {
              scanDir(fullPath, relativeItemPath, depth + 1);
            } else if (stats.isFile()) {
              this.projectFiles.set(relativeItemPath, {
                fullPath,
                size: stats.size,
                modified: stats.mtime,
                status: 'ready'
              });
            }
          } catch (error) {
            errorHandler.handleWarning('FileScan', `Erreur scan: ${item}`);
          }
        });
      } catch (error) {
        errorHandler.handleError('DirectoryScan', error);
      }
    };
    
    scanDir(this.projectPath);
    
    console.log(`📊 ${this.projectFiles.size} fichiers détectés`);
  }
  
  // Vérifier si un fichier doit être ignoré
  shouldIgnoreFile(fileName) {
    const ignorePatterns = [
      'node_modules', '.git', '.vscode', '.idea',
      '.DS_Store', 'Thumbs.db', '*.log', '*.tmp',
      'dist', 'build', '.cache', '.temp', '.syncteam'
    ];
    
    return ignorePatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(fileName);
      }
      return fileName === pattern || fileName.startsWith(pattern);
    });
  }
  
  // Générer une couleur pour l'utilisateur
  generateUserColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
      '#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD',
      '#00D2D3', '#FF9F43', '#10AC84', '#EE5A6F'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
  
  // Analyser le projet avec l'IA
  analyzeProjectWithAI() {
    if (!this.projectPath || this.projectFiles.size === 0) return;
    
    console.log('🤖 Analyse IA du projet...');
    
    // Analyser les fichiers principaux
    const mainFiles = Array.from(this.projectFiles.keys())
      .filter(file => file.includes('main') || file.includes('index'))
      .slice(0, 5);
    
    mainFiles.forEach(fileName => {
      try {
        const fileInfo = this.projectFiles.get(fileName);
        const content = fs.readFileSync(fileInfo.fullPath, 'utf8');
        this.aiAssistant.analyzeCode(fileName, content);
      } catch (error) {
        errorHandler.handleWarning('AIAnalysis', `Erreur analyse: ${fileName}`);
      }
    });
  }
  
  // Envoyer un message au renderer
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
  
  // Déconnexion
  async disconnect() {
    try {
      console.log('🔌 Déconnexion...');
      
      if (this.syncServer) {
        this.syncServer.close();
        this.syncServer = null;
      }
      
      if (this.backup) {
        this.backup.stop();
      }
      
      this.isHost = false;
      this.isConnected = false;
      this.sessionId = null;
      this.sessionPassword = null;
      
      this.sendToRenderer('disconnected');
      
      console.log('✅ Déconnexion terminée');
    } catch (error) {
      errorHandler.handleError('Disconnect', error);
      throw error;
    }
  }
  
  // Méthodes utilitaires
  handleClientDisconnect(ws) {
    this.stats.updateClientCount(this.syncServer.clients.size);
    this.liveSyncEngine.removeClient(ws.clientId);
  }
  
  broadcastLiveBatch(batch) {
    if (!this.syncServer) return;
    
    const message = JSON.stringify({
      type: 'batch',
      data: batch
    });
    
    this.syncServer.clients.forEach(client => {
      if (client.authenticated && client.readyState === 1) {
        client.send(message);
      }
    });
  }
  
  applyConfigChanges(configUpdate) {
    console.log('⚙️ Application des changements de configuration');
    
    // Relancer les services si nécessaire
    if (configUpdate.networkMode && this.syncServer) {
      this.disconnect().then(() => {
        if (this.isHost) {
          this.startOptimizedServer();
        }
      });
    }
  }
}

// Initialiser l'application
const syncTeamApp = new SyncTeamApp();

// Gestion propre de la fermeture
process.on('SIGINT', () => {
  console.log('🛑 Arrêt de l\'application...');
  syncTeamApp.disconnect().then(() => {
    process.exit(0);
  });
});

module.exports = SyncTeamApp; 