const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const WebSocket = require('ws');

// 🚀 MODULES LIVE CODING AVANCÉS
const LiveSyncEngine = require('./live-sync');
const ConflictResolver = require('./conflict-resolver');
const OptimizedWebSocket = require('./ws-optimized');
const AICodeAssistant = require('./ai-assistant');
const AuthManager = require('./auth');
const StatsManager = require('./stats');
const ConfigManager = require('./config');
const BackupManager = require('./backup');
const GitHubUpdateChecker = require('./github-update-checker');

const { instance: errorHandler } = require('./error-handler');

const { instance: ipcManager } = require('./ipc-manager');
const NetworkManager = require('./network-manager');
const IPCHandlers = require('./handlers/ipc-handlers');

class CodeSyncApp {
  constructor() {
    this.mainWindow = null;
    this.syncServer = null;
    this.syncClient = null;
    this.projectPath = '';
    this.projectFiles = new Map();
    this.isHost = false;
    this.isConnected = false;
    this.watchers = [];
    
    // 🔥 MODULES LIVE CODING REFACTORISÉS
    this.configManager = new ConfigManager();
    this.networkManager = new NetworkManager(this.configManager);
    this.liveSyncEngine = new LiveSyncEngine(this.configManager);
    this.conflictResolver = new ConflictResolver();
    this.aiAssistant = new AICodeAssistant();
    this.auth = new AuthManager();
    this.stats = new StatsManager();
    this.backup = null; // Initialisé quand un projet est sélectionné
    
    // Connexion WebSocket optimisée
    this.wsOptimized = null;
    
    // État du client
    this.clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.userName = 'Utilisateur';
    this.userColor = this.generateUserColor();
    
    // Configuration live coding
    this.liveMode = {
      enabled: true,
      realtimeSync: true,
      conflictResolution: 'auto',
      aiAssistance: true,
      cursorSharing: true,
      presenceIndicators: true
    };
    
    // Session de live coding
    this.sessionPassword = null;
    this.collaborators = new Map();
    
    // Configurer la gestion d'erreurs
    this.setupErrorHandling();
    
    // Configurer les middlewares IPC
    this.setupIPCMiddlewares();
    
    this.setupAutoUpdater();
    this.setupLiveSyncEvents();
  }
  
  // Configuration de la gestion d'erreurs
  setupErrorHandling() {
    // Écouter les erreurs pour les logs
    errorHandler.addListener((error) => {
      this.sendToRenderer('error-notification', {
        type: error.type,
        message: error.message,
        source: error.source,
        timestamp: error.timestamp
      });
    });
    
    console.log('✅ Gestionnaire d\'erreurs configuré');
  }
  
  // Configuration des middlewares IPC
  setupIPCMiddlewares() {
    // Rate limiting : 50 appels par minute
    ipcManager.addMiddleware(
      ipcManager.createRateLimitMiddleware(50, 60000)
    );
    
    // Validation IP pour les connexions réseau
    ipcManager.addMiddleware(
      ipcManager.createIPValidationMiddleware()
    );
    
    console.log('✅ Middlewares IPC configurés');
  }

  setupAutoUpdater() {
    // Configuration de l'auto-updater GitHub
    console.log('🔄 Auto-updater GitHub configuré');
    
    // Vérification automatique au démarrage (après 5 secondes)
    setTimeout(async () => {
      try {
        console.log('🔍 Vérification automatique des mises à jour...');
        const updateChecker = new GitHubUpdateChecker();
        const updateInfo = await updateChecker.checkForUpdates();
        
        if (updateInfo.hasUpdate) {
          console.log(`🆕 Mise à jour disponible: ${updateInfo.version}`);
          
          // Notifier l'interface
          this.sendToRenderer('update-available', {
            version: updateInfo.version,
            releaseNotes: updateInfo.commitMessage,
            message: updateInfo.message
          });
        } else {
          console.log('✅ Application à jour');
          this.sendToRenderer('update-not-available');
        }
      } catch (error) {
        console.error('❌ Erreur vérification auto:', error);
        this.sendToRenderer('update-error', { error: error.message });
      }
    }, 5000);
    
    // Vérification périodique (toutes les heures)
    setInterval(async () => {
      try {
        const updateChecker = new GitHubUpdateChecker();
        const updateInfo = await updateChecker.checkForUpdates();
        
        if (updateInfo.hasUpdate) {
          this.sendToRenderer('update-available', {
            version: updateInfo.version,
            releaseNotes: updateInfo.commitMessage,
            message: updateInfo.message
          });
        }
      } catch (error) {
        console.warn('⚠️ Vérification périodique échouée:', error.message);
      }
    }, 3600000); // 1 heure
  }

  setupLiveSyncEvents() {
    // Événements du moteur de synchronisation
    this.liveSyncEngine.on('operations_batch', (batch) => {
      this.broadcastLiveBatch(batch);
    });
    
    this.liveSyncEngine.on('presence_update', (presenceList) => {
      this.sendToRenderer('presence_update', presenceList);
    });
    
    this.liveSyncEngine.on('lock_update', (lockUpdate) => {
      this.sendToRenderer('lock_update', lockUpdate);
    });
    
    // Événements de l'assistant IA
    this.aiAssistant.on('suggestion', (suggestion) => {
      this.sendToRenderer('ai_suggestion', suggestion);
    });
    
    // Nettoyage périodique
    setInterval(() => {
      this.liveSyncEngine.cleanupInactiveClients();
      this.conflictResolver.cleanupHistory();
    }, 300000); // 5 minutes
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1600,
      height: 1000,
      minWidth: 1200,
      minHeight: 800,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      titleBarStyle: 'default',
      show: false,
      backgroundColor: '#0d1117',
      title: 'syncTEAM - Live Coding Platform'
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

    // Empêcher la fermeture accidentelle
    this.mainWindow.on('close', (event) => {
      console.log('🔒 Tentative de fermeture de l\'application');
      // Ne pas empêcher la fermeture, juste logger
    });

    // Dev tools en mode développement
    if (process.argv.includes('--dev')) {
      this.mainWindow.webContents.openDevTools();
    }

    this.setupIpcHandlers();
  }

  setupIpcHandlers() {
    console.log('🔗 Configuration des handlers IPC avec gestionnaire centralisé...');
    
    // Initialiser les handlers IPC centralisés
    this.ipcHandlers = new IPCHandlers(this);
    
    console.log('✅ Handlers IPC configurés avec succès');

    // Ancien handlers supprimés - maintenant centralisés dans IPCHandlers

    // Ajouter un handler pour la liste des fichiers du projet (conservé car spécifique)
    ipcManager.handle('request-project-files', async () => {
      console.log('📋 Envoi de la liste des fichiers au renderer...');
      
      const filesList = [];
      this.projectFiles.forEach((fileInfo, fileName) => {
        filesList.push({
          name: fileName,
          fullPath: fileInfo.fullPath,
          size: fileInfo.size,
          modified: fileInfo.modified,
          status: fileInfo.status || 'ready'
        });
      });
      
      return {
        success: true,
        files: filesList,
        projectPath: this.projectPath,
        totalFiles: filesList.length
      };
    });

    // Tous les autres handlers IPC sont maintenant centralisés dans IPCHandlers

    // 📊 TOUS LES ANCIENS HANDLERS IPC SUPPRIMÉS - MAINTENANT CENTRALISÉS

    // Handlers de mise à jour...
    this.setupUpdateHandlers();
  }

  // 🚀 SERVEUR OPTIMISÉ POUR LIVE CODING avec NetworkManager
  async startOptimizedServer(serverConfig = null) {
    try {
      // Utiliser la configuration fournie ou obtenir via NetworkManager
      const config = serverConfig || this.networkManager.getServerConfig();
      
      console.log(`🚀 Démarrage serveur optimisé [${config.mode}]:`, config);
    
    this.syncServer = new WebSocket.Server({ 
      port: port,
      host: host, // Spécifier l'host selon la configuration
      maxPayload: 10 * 1024 * 1024 // 10MB max
      });

      this.syncServer.on('connection', (ws) => {
      console.log('🔗 Nouvelle connexion live coding');
      this.stats.recordConnection();

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
          this.handleLiveMessage(ws, message);
          } catch (error) {
          console.error('Erreur message live:', error);
          this.stats.recordError();
          }
        });

        ws.on('close', () => {
        this.handleClientDisconnect(ws);
      });
      
      ws.on('error', (error) => {
        console.error('Erreur WebSocket live:', error);
        this.stats.recordError();
      });
    });
    
    console.log(`🚀 Serveur live coding sur ${host}:${port}`);
    
    if (host === '0.0.0.0') {
      const networkInterfaces = require('os').networkInterfaces();
      Object.keys(networkInterfaces).forEach(interfaceName => {
        networkInterfaces[interfaceName].forEach(iface => {
          if (iface.family === 'IPv4' && !iface.internal) {
            console.log(`🌐 Accessible depuis: ${iface.address}:${port}`);
          }
        });
      });
    } else {
      console.log(`🏠 Accessible uniquement en local: localhost:${port}`);
    }
  }

  // 🔗 CONNEXION À SESSION LIVE
  async connectToLiveSession(hostIP, sessionId, password) {
    const wsUrl = `ws://${hostIP}:${this.configManager.get('server.port')}`;
    
    this.wsOptimized = new OptimizedWebSocket({
      heartbeatInterval: 15000, // Plus fréquent pour le live coding
      batchingInterval: 8 // 120fps pour ultra-réactivité
    });
    
    // Events WebSocket optimisé
    this.wsOptimized.on('connected', () => {
      // Authentification
      this.wsOptimized.send({
        type: 'auth',
        sessionId: sessionId,
        password: password,
        clientInfo: {
          clientId: this.clientId,
          userName: this.userName,
          color: this.userColor
        }
      }, { priority: true });
    });
    
    this.wsOptimized.on('operation', (message) => {
      this.handleRemoteLiveOperation(message);
    });
    
    this.wsOptimized.on('cursor_update', (message) => {
      this.sendToRenderer('remote_cursor_update', message);
    });
    
    this.wsOptimized.on('presence_update', (message) => {
      this.sendToRenderer('presence_update', message);
    });
    
    this.wsOptimized.connect(wsUrl);
  }

  // 📝 GESTION DES MESSAGES LIVE
  handleLiveMessage(ws, message) {
    switch (message.type) {
      case 'auth':
        this.handleLiveAuth(ws, message);
        break;
        
      case 'operation':
        this.handleLiveOperation(ws, message);
        break;
        
      case 'cursor_update':
        this.broadcastToOthers(ws, message);
        break;
        
      case 'request_sync':
        this.sendFullProjectSync(ws);
        break;
        
      default:
        console.log('Message live non géré:', message.type);
    }
  }

  // 🔐 AUTHENTIFICATION LIVE
  handleLiveAuth(ws, message) {
    const { sessionId, password, clientInfo } = message;
    
    if (this.auth.validateSession(sessionId, password)) {
      // Authentification réussie
      ws.clientInfo = clientInfo;
      ws.authenticated = true;
      
      // Ajouter le client au moteur live
      this.liveSyncEngine.addClient(
        clientInfo.clientId, 
        clientInfo.userName,
        clientInfo.avatar
      );
      
      // Envoyer confirmation
      ws.send(JSON.stringify({
        type: 'auth_success',
        sessionId: sessionId
      }));
      
      // Envoyer l'état complet du projet
      this.sendFullProjectSync(ws);
      
      console.log(`✅ Client authentifié: ${clientInfo.userName}`);
      
    } else {
      // Authentification échouée
      ws.send(JSON.stringify({
        type: 'auth_error',
        error: 'Session ou mot de passe invalide'
      }));
      
      ws.close(4001, 'Authentication failed');
    }
  }

  // ⚡ DIFFUSION BATCH OPTIMISÉE
  broadcastLiveBatch(batch) {
    if (!this.syncServer) return;
    
    const message = JSON.stringify({
      type: 'live_batch',
      batch: batch,
      timestamp: Date.now()
    });
    
    this.syncServer.clients.forEach(client => {
      if (client.authenticated && client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error('Erreur envoi batch:', error);
          this.stats.recordError();
        }
      }
    });
  }

  // 🧠 ANALYSE IA DU PROJET
  analyzeProjectWithAI() {
    if (!this.projectPath) return;
    
    const files = Array.from(this.projectFiles.keys());
    files.forEach(fileName => {
      const filePath = this.projectFiles.get(fileName).fullPath;
      
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const analysis = this.aiAssistant.analyzeCode(fileName, content);
        
        // Envoyer l'analyse au renderer
        this.sendToRenderer('ai_analysis', {
          fileName: fileName,
          analysis: analysis
        });
        
        } catch (error) {
        console.error(`Erreur analyse IA ${fileName}:`, error);
      }
    });
  }

  generateUserColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
      '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // Déterminer si le mode réseau doit être activé automatiquement
  shouldEnableNetworkMode() {
    // Logique simple : si plus de 0 clients connectés récemment
    return this.syncServer && this.syncServer.clients.size > 0;
  }

  // ... reste des méthodes existantes (scanProjectFiles, setupFileWatcher, etc.)
  
  // 📁 Scanner les fichiers projet
  scanProjectFiles() {
    this.projectFiles.clear();
    console.log(`🔍 Scan du projet: ${this.projectPath}`);
    
    const maxDepth = this.configManager.get('files.maxDepth');
    const scanDir = (dirPath, relativePath = '', depth = 0) => {
      if (depth > maxDepth) {
        console.warn(`⚠️ Profondeur maximale atteinte: ${dirPath}`);
        return;
      }
      
      try {
        const files = fs.readdirSync(dirPath);
        files.forEach(file => {
          const fullPath = path.join(dirPath, file);
          const relativeFilePath = path.join(relativePath, file).replace(/\\/g, '/');
          
          if (this.shouldIgnoreFile(file)) return;
          
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scanDir(fullPath, relativeFilePath, depth + 1);
          } else {
            this.projectFiles.set(relativeFilePath, {
              fullPath: fullPath,
              size: stat.size,
              modified: stat.mtime.getTime(),
              status: 'ready'
            });
            
            // Initialiser le document pour le live sync
            if (this.liveSyncEngine) {
              const content = fs.readFileSync(fullPath, 'utf8');
              this.liveSyncEngine.initializeDocument(relativeFilePath, content);
            }
          }
        });
      } catch (error) {
        console.error(`Erreur scan dossier ${dirPath}:`, error);
      }
    };
    
    scanDir(this.projectPath);
    console.log(`✅ ${this.projectFiles.size} fichiers trouvés`);
  }

  shouldIgnoreFile(fileName) {
    const ignorePatterns = this.configManager.get('files.ignorePatterns');
    
    return ignorePatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(fileName);
      }
      return fileName === pattern || fileName.startsWith(pattern);
    });
  }

  // Méthodes manquantes ajoutées
  sendToRenderer(channel, data) {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  initializeProjectDocuments() {
    if (!this.projectPath) return;
    
    console.log('🔧 Initialisation des documents du projet...');
    this.projectFiles.forEach((fileInfo, fileName) => {
      try {
        const content = fs.readFileSync(fileInfo.fullPath, 'utf8');
        this.liveSyncEngine.initializeDocument(fileName, content);
      } catch (error) {
        console.error(`Erreur initialisation document ${fileName}:`, error);
      }
    });
  }

  setupFileWatcher() {
    if (!this.projectPath) return;
    
    console.log('👀 Configuration du watcher de fichiers...');
    
    // Utiliser chokidar pour un watching plus robuste
    if (this.fileWatcher) {
      this.fileWatcher.close();
    }
    
    // Watcher simple avec fs.watch pour l'instant
    this.fileWatcher = fs.watch(this.projectPath, { recursive: true }, (eventType, filename) => {
      if (filename && !this.shouldIgnoreFile(filename)) {
        console.log(`📝 Fichier modifié: ${filename}`);
        this.handleFileChange(filename, eventType);
      }
    });
  }

  handleFileChange(filename, eventType) {
    const fullPath = path.join(this.projectPath, filename);
    
    try {
      if (eventType === 'change' && fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const stat = fs.statSync(fullPath);
        
        // Mettre à jour les infos du fichier
        this.projectFiles.set(filename, {
          fullPath: fullPath,
          size: stat.size,
          modified: stat.mtime.getTime(),
          status: 'modified'
        });
        
        // Notifier le renderer
        this.sendToRenderer('file_changed', {
          fileName: filename,
          content: content,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error(`Erreur traitement changement fichier ${filename}:`, error);
    }
  }

  setupUpdateHandlers() {
    // Configuration des handlers de mise à jour
    console.log('🔄 Configuration des handlers de mise à jour...');
  }

  handleClientDisconnect(ws) {
    if (ws.clientInfo) {
      console.log(`👋 Client déconnecté: ${ws.clientInfo.userName}`);
      this.liveSyncEngine.removeClient(ws.clientInfo.clientId);
      
      // Notifier les autres clients
      this.broadcastToOthers(ws, {
        type: 'client_disconnected',
        clientId: ws.clientInfo.clientId
      });
    }
  }

  handleRemoteLiveOperation(message) {
    try {
      const success = this.liveSyncEngine.applyTextOperation(
        message.clientId,
        message.fileName,
        message.operation
      );
      
      if (success) {
        // Appliquer localement et notifier le renderer
        this.sendToRenderer('remote_operation', message);
      }
    } catch (error) {
      console.error('Erreur traitement opération distante:', error);
    }
  }

  handleLiveOperation(ws, message) {
    try {
      // Appliquer l'opération
      const success = this.liveSyncEngine.applyTextOperation(
        message.clientId,
        message.fileName,
        message.operation
      );
      
      if (success) {
        // Diffuser aux autres clients
        this.broadcastToOthers(ws, message);
      }
    } catch (error) {
      console.error('Erreur traitement opération live:', error);
    }
  }

  broadcastToOthers(excludeWs, message) {
    if (!this.syncServer) return;
    
    const messageStr = JSON.stringify(message);
    
    this.syncServer.clients.forEach(client => {
      if (client !== excludeWs && 
          client.authenticated && 
          client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          console.error('Erreur diffusion message:', error);
        }
      }
    });
  }

  sendFullProjectSync(ws) {
    if (!ws.authenticated) return;
    
    console.log('📦 Envoi synchronisation complète du projet...');
    
    const projectData = {
      type: 'full_project_sync',
      files: {},
      timestamp: Date.now()
    };
    
    // Envoyer le contenu de tous les fichiers
    this.projectFiles.forEach((fileInfo, fileName) => {
      try {
        const content = fs.readFileSync(fileInfo.fullPath, 'utf8');
        projectData.files[fileName] = {
          content: content,
          modified: fileInfo.modified,
          size: fileInfo.size
        };
    } catch (error) {
        console.error(`Erreur lecture fichier ${fileName}:`, error);
      }
    });
    
    try {
      ws.send(JSON.stringify(projectData));
    } catch (error) {
      console.error('Erreur envoi sync complète:', error);
    }
  }

  applyConfigChanges(configUpdate) {
    try {
      Object.keys(configUpdate).forEach(key => {
        this.configManager.set(key, configUpdate[key]);
      });
      
      this.configManager.save();
      console.log('⚙️ Configuration mise à jour');
      
    } catch (error) {
      console.error('Erreur application config:', error);
    }
  }

  disconnect() {
    console.log('🔌 Déconnexion...');
    
    if (this.fileWatcher) {
      this.fileWatcher.close();
    }
    
    if (this.syncServer) {
      this.syncServer.close();
    }
    
    if (this.backup) {
      this.backup.stop();
    }
    
    if (this.liveSyncEngine) {
      this.liveSyncEngine.cleanup();
    }
  }
}

// Initialisation de l'app
const codeSyncApp = new CodeSyncApp();

app.whenReady().then(() => {
  codeSyncApp.createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      codeSyncApp.createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  codeSyncApp.disconnect();
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  console.error('Erreur non capturée:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesse rejetée non gérée:', reason);
}); 