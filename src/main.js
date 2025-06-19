const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const WebSocket = require('ws');

class CodeSyncApp {
  constructor() {
    this.mainWindow = null;
    this.syncServer = null;
    this.syncClient = null;
    this.projectPath = '';
    this.isHost = false;
    this.isConnected = false;
    this.watchers = [];
    // SERVEUR DE RELAIS TEMPORAIRE POUR TESTS
    this.relayServer = 'wss://echo.websocket.org'; // Serveur de test public
    this.sessionId = null;
    this.projectFiles = new Map();
    this.watcherEnabled = true;
    
    // **NOUVEAU : Debouncing pour éviter les événements en rafale**
    this.fileChangeQueue = new Map();
    this.debounceTimeout = null;
    
    // **SYSTÈME DE MISE À JOUR**
    this.setupAutoUpdater();
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1000,
      minHeight: 700,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      titleBarStyle: 'default',
      show: false,
      backgroundColor: '#0d1117'
    });

    this.mainWindow.loadFile('src/renderer/index.html');
    
    // Afficher la fenêtre quand elle est prête
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
    });

    // Dev tools en mode développement
    if (process.argv.includes('--dev')) {
      this.mainWindow.webContents.openDevTools();
    }

    this.setupIpcHandlers();
  }

  setupIpcHandlers() {
    // Sélectionner un dossier de projet
    ipcMain.handle('select-project-folder', async () => {
      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ['openDirectory'],
        title: 'Sélectionner le dossier du projet à synchroniser'
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        this.projectPath = result.filePaths[0];
        this.scanProjectFiles();
        return { success: true, path: this.projectPath };
      }
      return { success: false };
    });

    // Démarrer en tant qu'hôte
    ipcMain.handle('start-host', async () => {
      try {
        if (!this.projectPath) {
          return { success: false, error: 'Aucun projet sélectionné' };
        }

        // Générer un ID de session unique
        this.sessionId = `session_${Date.now()}`;
        
        await this.startServer();
        this.isHost = true;
        this.isConnected = true;
        this.setupFileWatcher();
        
        console.log(`🖥️ Serveur démarré - Session: ${this.sessionId}`);
        
        return { 
          success: true, 
          sessionId: this.sessionId,
          message: `Session créée: ${this.sessionId}` 
        };
      } catch (error) {
        console.error('Erreur démarrage serveur:', error);
        return { success: false, error: error.message };
      }
    });

    // Se connecter à un hôte
    ipcMain.handle('connect-to-host', async (event, hostInfo) => {
      try {
        const { sessionId } = hostInfo;
        await this.connectToSession(sessionId);
        this.isConnected = true;
        
        // Demander la synchronisation initiale
        this.requestInitialSync();
        
        return { success: true, message: `Connecté à la session ${sessionId}` };
      } catch (error) {
        console.error('Erreur connexion:', error);
        return { success: false, error: error.message };
      }
    });

    // Déconnecter
    ipcMain.handle('disconnect', async () => {
      this.disconnect();
      return { success: true };
    });

    // Obtenir les statistiques
    ipcMain.handle('get-stats', async () => {
      return {
        isHost: this.isHost,
        isConnected: this.isConnected,
        projectPath: this.projectPath,
        connectedClients: this.syncServer ? this.syncServer.clients.size : 0,
        sessionId: this.sessionId
      };
    });

    // Ouvrir le dossier projet
    ipcMain.handle('open-project-folder', async () => {
      if (this.projectPath) {
        shell.openPath(this.projectPath);
      }
    });

    // **GESTION DES MISES À JOUR**
    ipcMain.handle('check-for-updates', async () => {
      try {
        const result = await autoUpdater.checkForUpdatesAndNotify();
        return { success: true, updateAvailable: !!result };
      } catch (error) {
        console.error('Erreur vérification mise à jour:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('download-update', async () => {
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (error) {
        console.error('Erreur téléchargement mise à jour:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('install-update', async () => {
      try {
        autoUpdater.quitAndInstall();
        return { success: true };
      } catch (error) {
        console.error('Erreur installation mise à jour:', error);
        return { success: false, error: error.message };
      }
    });
  }

  setupAutoUpdater() {
    // Configuration de l'auto-updater
    autoUpdater.logger = require('electron-log');
    autoUpdater.logger.transports.file.level = 'info';
    
    // Désactiver les mises à jour automatiques pour laisser l'utilisateur choisir
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    // Événements de mise à jour
    autoUpdater.on('checking-for-update', () => {
      console.log('🔍 Vérification des mises à jour...');
      this.sendToRenderer('update-checking');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('✨ Mise à jour disponible:', info.version);
      this.sendToRenderer('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
        releaseDate: info.releaseDate
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('✅ Application à jour');
      this.sendToRenderer('update-not-available');
    });

    autoUpdater.on('error', (err) => {
      console.error('❌ Erreur mise à jour:', err);
      this.sendToRenderer('update-error', { error: err.message });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      console.log(`📥 Téléchargement: ${Math.round(progressObj.percent)}%`);
      this.sendToRenderer('update-download-progress', {
        percent: Math.round(progressObj.percent),
        bytesPerSecond: progressObj.bytesPerSecond,
        total: progressObj.total,
        transferred: progressObj.transferred
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('✅ Mise à jour téléchargée, prête à installer');
      this.sendToRenderer('update-downloaded', {
        version: info.version
      });
    });
  }

  sendToRenderer(channel, data = {}) {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  scanProjectFiles() {
    if (!this.projectPath) return;
    
    this.projectFiles.clear();
    
    const scanDir = (dirPath, relativePath = '') => {
      try {
        const items = fs.readdirSync(dirPath);
        
        items.forEach(item => {
          const fullPath = path.join(dirPath, item);
          const relPath = path.join(relativePath, item);
          
          // Ignorer certains dossiers et fichiers
          if (this.shouldIgnoreFile(item)) {
            return;
          }

          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            scanDir(fullPath, relPath);
          } else {
            this.projectFiles.set(relPath, {
              fullPath: fullPath,
              size: stat.size,
              modified: stat.mtime.getTime(),
              status: 'synced'
            });
          }
        });
      } catch (error) {
        console.error(`Erreur scan dossier ${dirPath}:`, error);
      }
    };

    scanDir(this.projectPath);
    console.log(`📁 Projet scanné: ${this.projectFiles.size} fichiers trouvés`);
  }

  shouldIgnoreFile(fileName) {
    const ignorePatterns = [
      /^\./, // fichiers cachés
      /^node_modules$/,
      /^\.git$/,
      /^dist$/,
      /^build$/,
      /^coverage$/,
      /\.log$/,
      /\.tmp$/,
      /\.temp$/,
      /^\.DS_Store$/,
      /^Thumbs\.db$/
    ];
    
    return ignorePatterns.some(pattern => pattern.test(fileName));
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      this.syncClient = new WebSocket(this.relayServer);
      
      this.syncClient.on('open', () => {
        console.log('🖥️ Connexion au serveur de relais établie');
        
        // Créer une room
        this.syncClient.send(JSON.stringify({
          type: 'create_room',
          sessionId: this.sessionId
        }));
        
        this.startHeartbeat();
      });

      this.syncClient.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleRelayMessage(message);
        } catch (error) {
          console.error('Erreur traitement message relais:', error);
        }
      });

      this.syncClient.on('close', () => {
        console.log('🔌 Connexion au relais fermée');
        this.isConnected = false;
        this.updateUI();
      });

      this.syncClient.on('error', (error) => {
        console.error('Erreur connexion relais:', error);
        reject(error);
      });
      
      // Résoudre après connexion
      this.syncClient.on('open', resolve);
    });
  }

  async connectToSession(sessionId) {
    return new Promise((resolve, reject) => {
      console.log(`🔗 Connexion à la session ${sessionId}...`);
      
      this.syncClient = new WebSocket(this.relayServer);
      
      this.syncClient.on('open', () => {
        console.log('✅ Connecté au serveur de relais');
        
        // Rejoindre la room
        this.syncClient.send(JSON.stringify({
          type: 'join_room',
          sessionId: sessionId
        }));
        
        this.isConnected = true;
        this.startHeartbeat();
        resolve();
      });

      this.syncClient.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleRelayMessage(message);
        } catch (error) {
          console.error('Erreur traitement message client:', error);
        }
      });

      this.syncClient.on('close', () => {
        console.log('🔌 Connexion fermée');
        this.isConnected = false;
        this.updateUI();
      });

      this.syncClient.on('error', (error) => {
        console.error('Erreur connexion:', error);
        this.isConnected = false;
        reject(error);
      });
    });
  }

  handleRelayMessage(message) {
    switch (message.type) {
      case 'room_created':
        console.log(`🏠 Room créée: ${message.sessionId}`);
        this.updateUI();
        break;
        
      case 'room_joined':
        console.log(`✅ Rejoint la room: ${message.sessionId}`);
        this.requestInitialSync();
        break;
        
      case 'client_joined':
        console.log(`👤 Client connecté. Total: ${message.clientCount}`);
        this.updateUI();
        break;
        
      case 'client_left':
        console.log(`👋 Client déconnecté. Restant: ${message.clientCount}`);
        this.updateUI();
        break;
        
      case 'relayed_data':
        this.handleSyncData(message.data);
        break;
        
      case 'room_closed':
        console.log('🏠 Room fermée par l\'hôte');
        this.disconnect();
        break;
        
      case 'error':
        console.error('❌ Erreur serveur:', message.message);
        break;
        
      case 'pong':
        // Heartbeat response
        break;
    }
  }
  
  handleSyncData(data) {
    switch (data.type) {
      case 'request_initial_sync':
        if (this.isHost) {
          this.sendProjectFiles();
        }
        break;
      case 'initial_sync':
        this.applyInitialSync(data);
        break;
      case 'file_change':
        console.log(`📥 Changement reçu: ${data.action} - ${data.filePath}`);
        this.applyFileChange(data);
        break;
    }
  }



  sendProjectFiles() {
    if (!this.projectPath || this.projectFiles.size === 0) {
      this.sendRelayData({
        type: 'initial_sync',
        files: {},
        projectName: path.basename(this.projectPath || 'empty-project'),
        sessionId: this.sessionId
      });
      return;
    }

    const files = {};
    
    this.projectFiles.forEach((fileInfo, relativePath) => {
      try {
        const content = fs.readFileSync(fileInfo.fullPath, 'utf8');
        files[relativePath] = {
          content: content,
          modified: fileInfo.modified,
          size: fileInfo.size
        };
      } catch (error) {
        console.error(`Erreur lecture fichier ${fileInfo.fullPath}:`, error);
      }
    });

    const syncData = {
      type: 'initial_sync',
      files: files,
      projectName: path.basename(this.projectPath),
      sessionId: this.sessionId,
      totalFiles: Object.keys(files).length
    };

    console.log(`📤 Envoi de ${Object.keys(files).length} fichiers via relais`);
    this.sendRelayData(syncData);
  }
  
  sendRelayData(data) {
    if (this.syncClient && this.syncClient.readyState === WebSocket.OPEN) {
      this.syncClient.send(JSON.stringify({
        type: 'relay_data',
        data: data
      }));
    }
  }

  applyInitialSync(syncData) {
    const { files, projectName, sessionId } = syncData;
    
    if (!this.projectPath) {
      // Demander où créer le projet avec gestion intelligente des noms
      dialog.showOpenDialog(this.mainWindow, {
        properties: ['openDirectory'],
        title: 'Choisir où synchroniser le projet'
      }).then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
          this.projectPath = this.getUniqueProjectPath(result.filePaths[0], projectName);
          this.createProjectFromSync(syncData);
        }
      });
    } else {
      this.createProjectFromSync(syncData);
    }
  }

  getUniqueProjectPath(parentDir, projectName) {
    let basePath = path.join(parentDir, projectName);
    let counter = 1;
    
    // Si le dossier existe déjà, ajouter un suffixe
    while (fs.existsSync(basePath)) {
      basePath = path.join(parentDir, `${projectName}_${counter}`);
      counter++;
    }
    
    return basePath;
  }

  createProjectFromSync(syncData) {
    const { files, projectName, sessionId } = syncData;
    
    try {
      // Créer le dossier projet si nécessaire
      if (!fs.existsSync(this.projectPath)) {
        fs.mkdirSync(this.projectPath, { recursive: true });
        console.log(`📁 Dossier projet créé: ${this.projectPath}`);
      }

      let createdFiles = 0;
      let errors = 0;

      // **DÉSACTIVER LE WATCHER PENDANT LA SYNC INITIALE**
      this.watcherEnabled = false;

      // Créer tous les fichiers
      Object.entries(files).forEach(([filePath, fileData]) => {
        try {
          const fullPath = path.join(this.projectPath, filePath);
          const dirPath = path.dirname(fullPath);
          
          // Créer le dossier parent si nécessaire
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
          
          // Écrire le fichier
          fs.writeFileSync(fullPath, fileData.content, 'utf8');
          
          // Créer hash pour le fichier
          const crypto = require('crypto');
          const hash = crypto.createHash('md5').update(fileData.content).digest('hex');
          
          // Mettre à jour la liste des fichiers
          this.projectFiles.set(filePath, {
            fullPath: fullPath,
            size: fileData.size,
            modified: fileData.modified,
            status: 'synced',
            hash: hash
          });
          
          createdFiles++;
        } catch (error) {
          console.error(`Erreur création fichier ${filePath}:`, error);
          errors++;
        }
      });

      this.sessionId = sessionId;
      
      // **CONFIGURER LE WATCHER CÔTÉ CLIENT AUSSI**
      this.setupFileWatcher();
      
      // **RÉACTIVER LE WATCHER APRÈS LA SYNC**
      setTimeout(() => {
        this.watcherEnabled = true;
        console.log(`🎯 SYNCHRONISATION BIDIRECTIONNELLE ACTIVÉE - Client prêt!`);
      }, 500);
      
      this.updateUI();
      
      console.log(`✅ Synchronisation terminée: ${createdFiles} fichiers créés, ${errors} erreurs`);
      
      this.mainWindow.webContents.send('sync-complete', {
        message: 'Projet synchronisé avec succès!',
        fileCount: createdFiles,
        errors: errors
      });

    } catch (error) {
      console.error('Erreur synchronisation:', error);
      this.mainWindow.webContents.send('sync-error', {
        message: error.message
      });
    }
  }

  requestInitialSync() {
    this.sendRelayData({
      type: 'request_initial_sync'
    });
  }

  setupFileWatcher() {
    if (!this.projectPath) return;

    // Nettoyer les anciens watchers
    this.watchers.forEach(watcher => watcher.close());
    this.watchers = [];

    const watcher = chokidar.watch(this.projectPath, {
      ignored: [
        /(^|[\/\\])\../, // fichiers cachés
        /node_modules/,
        /\.git/,
        /dist/,
        /build/,
        /coverage/
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100, // Stabilité pour éviter les doubles événements
        pollInterval: 50
      }
    });

    // Désactiver temporairement le watcher pour éviter les boucles lors de l'application de changements
    this.watcherEnabled = true;

    watcher.on('change', (filePath) => {
      if (this.watcherEnabled) {
        this.queueFileChange(filePath, 'change');
      }
    });

    watcher.on('add', (filePath) => {
      if (this.watcherEnabled) {
        this.queueFileChange(filePath, 'add');
      }
    });

    watcher.on('unlink', (filePath) => {
      if (this.watcherEnabled) {
        this.queueFileChange(filePath, 'delete');
      }
    });

    watcher.on('error', (error) => {
      console.error('Erreur file watcher:', error);
    });

    this.watchers.push(watcher);
    console.log(`👁️ Surveillance des fichiers activée pour: ${this.projectPath}`);
  }

  // **NOUVEAU : Queue avec debouncing pour les changements de fichiers**
  queueFileChange(filePath, action) {
    const relativePath = path.relative(this.projectPath, filePath);
    
    // Ajouter à la queue
    this.fileChangeQueue.set(relativePath, {
      filePath,
      action,
      timestamp: Date.now()
    });

    // Debounce : traiter la queue après un délai
    clearTimeout(this.debounceTimeout);
    this.debounceTimeout = setTimeout(() => {
      this.processFileChangeQueue();
    }, 50); // 50ms de debounce
  }

  // **NOUVEAU : Traitement de la queue des changements**
  processFileChangeQueue() {
    const changes = Array.from(this.fileChangeQueue.values());
    this.fileChangeQueue.clear();

    // Grouper les changements par fichier (garder seulement le plus récent)
    const latestChanges = new Map();
    changes.forEach(change => {
      const existing = latestChanges.get(change.filePath);
      if (!existing || change.timestamp > existing.timestamp) {
        latestChanges.set(change.filePath, change);
      }
    });

    // Traiter chaque changement unique
    latestChanges.forEach(change => {
      this.handleFileChange(change.filePath, change.action);
    });
  }

  handleFileChange(filePath, action) {
    const relativePath = path.relative(this.projectPath, filePath);
    
    // Ignorer certains fichiers
    if (this.shouldIgnoreFile(path.basename(filePath))) {
      return;
    }
    
    let content = null;
    let fileSize = 0;
    let hash = null;
    let delta = null;
    
    if (action !== 'delete') {
      try {
        content = fs.readFileSync(filePath, 'utf8');
        const stat = fs.statSync(filePath);
        fileSize = stat.size;
        
        // Créer un hash pour détecter les vraies modifications
        const crypto = require('crypto');
        hash = crypto.createHash('md5').update(content).digest('hex');
        
        // Vérifier si le fichier a vraiment changé
        const existingFile = this.projectFiles.get(relativePath);
        if (existingFile && existingFile.hash === hash) {
          return; // Pas de changement réel
        }
        
        // **OPTIMISATION : Delta sync pour gros fichiers**
        if (existingFile && fileSize > 1024) { // > 1KB
          try {
            const oldContent = fs.readFileSync(existingFile.fullPath, 'utf8');
            delta = this.calculateDelta(oldContent, content);
            console.log(`🔄 Delta calculé: ${delta.length} changements au lieu de ${fileSize} bytes`);
          } catch (err) {
            console.log('Fallback to full content');
          }
        }
        
        // Mettre à jour la liste des fichiers
        this.projectFiles.set(relativePath, {
          fullPath: filePath,
          size: fileSize,
          modified: Date.now(),
          status: 'syncing',
          hash: hash
        });
      } catch (error) {
        console.error('Erreur lecture fichier:', error);
        return;
      }
    } else {
      this.projectFiles.delete(relativePath);
    }

    const changeData = {
      type: 'file_change',
      action: action,
      filePath: relativePath,
      content: delta ? null : content, // N'envoyer content que si pas de delta
      delta: delta, // **NOUVEAU : Delta pour optimiser**
      size: fileSize,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      hash: hash,
      origin: this.isHost ? 'server' : 'client'
    };

    console.log(`📝 Changement détecté: ${action} - ${relativePath} (${this.isHost ? 'SERVEUR' : 'CLIENT'}) ${delta ? '[DELTA]' : '[FULL]'}`);

    // **COMPRESSION WebSocket**
    const compressed = this.compressMessage(changeData);

    // **SYNCHRONISATION BIDIRECTIONNELLE**
    if (this.isHost && this.syncServer) {
      // Serveur : diffuser aux clients
      this.broadcastToAll(compressed);
    } else if (this.syncClient && this.syncClient.readyState === WebSocket.OPEN) {
      // Client : envoyer au serveur
      this.syncClient.send(compressed);
    }

    // Notifier l'interface
    this.mainWindow.webContents.send('file-changed', {
      action: action,
      file: relativePath,
      size: fileSize,
      origin: changeData.origin
    });

    this.updateUI();
  }

  // **NOUVEAU : Calcul des deltas**
  calculateDelta(oldContent, newContent) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const deltas = [];
    
    for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
      if (oldLines[i] !== newLines[i]) {
        deltas.push({
          line: i,
          old: oldLines[i] || null,
          new: newLines[i] || null
        });
      }
    }
    
    return deltas;
  }

  // **NOUVEAU : Compression des messages**
  compressMessage(message) {
    const zlib = require('zlib');
    const jsonString = JSON.stringify(message);
    
    // Compresser seulement si > 500 bytes
    if (jsonString.length > 500) {
      const compressed = zlib.gzipSync(jsonString);
      return JSON.stringify({
        type: 'compressed',
        data: compressed.toString('base64')
      });
    }
    
    return jsonString;
  }

  // **NOUVEAU : Décompression des messages**
  decompressMessage(message) {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === 'compressed') {
        const zlib = require('zlib');
        const compressed = Buffer.from(parsed.data, 'base64');
        const decompressed = zlib.gunzipSync(compressed);
        return JSON.parse(decompressed.toString());
      }
      return parsed;
    } catch (error) {
      console.error('Erreur décompression:', error);
      return JSON.parse(message);
    }
  }

  applyFileChange(changeData) {
    if (!this.projectPath) return;

    const { action, filePath, content, delta, sessionId, hash, origin } = changeData;
    const fullPath = path.join(this.projectPath, filePath);
    
    // Éviter les boucles infinies - ne pas appliquer ses propres changements
    if (origin === (this.isHost ? 'server' : 'client')) {
      return;
    }
    
    try {
      // **DÉSACTIVER TEMPORAIREMENT LE WATCHER**
      this.watcherEnabled = false;
      
      switch (action) {
        case 'change':
        case 'add':
          const dirPath = path.dirname(fullPath);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
          
          let finalContent = content;
          
          // **APPLIQUER DELTA SI DISPONIBLE**
          if (delta && fs.existsSync(fullPath)) {
            try {
              const currentContent = fs.readFileSync(fullPath, 'utf8');
              finalContent = this.applyDelta(currentContent, delta);
              console.log(`✅ Delta appliqué: ${delta.length} changements`);
            } catch (err) {
              console.log('Fallback to full content');
              finalContent = content;
            }
          }
          
          // **AUTO-SAVE INSTANTANÉ**
          fs.writeFileSync(fullPath, finalContent, 'utf8');
          
          // Mettre à jour la liste des fichiers
          const stat = fs.statSync(fullPath);
          this.projectFiles.set(filePath, {
            fullPath: fullPath,
            size: stat.size,
            modified: Date.now(),
            status: 'synced',
            hash: hash
          });
          break;
          
        case 'delete':
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
          this.projectFiles.delete(filePath);
          break;
      }

      console.log(`✅ Changement appliqué: ${action} - ${filePath} (depuis ${origin})`);

      // **PROPAGER AUX AUTRES CLIENTS** (si on est le serveur)
      if (this.isHost && this.syncServer && origin === 'client') {
        const compressed = this.compressMessage(changeData);
        this.broadcastToAll(compressed);
      }

      this.mainWindow.webContents.send('file-changed', {
        action: action,
        file: filePath,
        origin: origin
      });

      // **RÉACTIVER LE WATCHER APRÈS UN DÉLAI**
      setTimeout(() => {
        this.watcherEnabled = true;
      }, 100);

    } catch (error) {
      console.error('Erreur application changement:', error);
      this.watcherEnabled = true;
    }
  }

  // **NOUVEAU : Application des deltas**
  applyDelta(content, deltas) {
    const lines = content.split('\n');
    
    // Appliquer les changements en ordre inverse pour ne pas décaler les numéros de lignes
    deltas.sort((a, b) => b.line - a.line);
    
    deltas.forEach(delta => {
      if (delta.new === null) {
        // Suppression de ligne
        lines.splice(delta.line, 1);
      } else if (delta.old === null) {
        // Ajout de ligne
        lines.splice(delta.line, 0, delta.new);
      } else {
        // Modification de ligne
        lines[delta.line] = delta.new;
      }
    });
    
    return lines.join('\n');
  }

  broadcastToAll(message) {
    if (this.syncServer) {
      this.syncServer.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      });
    }
  }

  broadcastToOthers(excludeWs, message) {
    if (this.syncServer) {
      this.syncServer.clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      });
    }
  }

  updateUI() {
    const stats = {
      isHost: this.isHost,
      isConnected: this.isConnected,
      projectPath: this.projectPath,
      connectedClients: this.syncServer ? this.syncServer.clients.size : 0,
      sessionId: this.sessionId,
      fileCount: this.projectFiles.size
    };

    this.mainWindow.webContents.send('stats-updated', stats);
  }

  // Heartbeat pour maintenir les connexions
  startHeartbeat() {
    setInterval(() => {
      if (this.isHost && this.syncServer) {
        this.broadcastToAll({ type: 'ping' });
      } else if (this.syncClient && this.syncClient.readyState === WebSocket.OPEN) {
        this.syncClient.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Ping toutes les 30 secondes
  }

  disconnect() {
    this.isHost = false;
    this.isConnected = false;
    this.sessionId = null;
    
    if (this.syncServer) {
      this.syncServer.close();
      this.syncServer = null;
      console.log('🖥️ Serveur fermé');
    }
    
    if (this.syncClient) {
      this.syncClient.close();
      this.syncClient = null;
      console.log('🔗 Client déconnecté');
    }
    
    this.watchers.forEach(watcher => watcher.close());
    this.watchers = [];
    
    this.updateUI();
  }
}

// Initialisation de l'app
const codeSyncApp = new CodeSyncApp();

app.whenReady().then(() => {
  codeSyncApp.createWindow();
  codeSyncApp.startHeartbeat();

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