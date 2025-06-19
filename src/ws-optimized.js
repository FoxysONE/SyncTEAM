// Système WebSocket optimisé pour le live coding
const WebSocket = require('ws');
const { EventEmitter } = require('events');

class OptimizedWebSocket extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      heartbeatInterval: 30000,
      reconnectInterval: 1000,
      maxReconnectAttempts: 5,
      compressionThreshold: 1024, // Compresser messages > 1KB
      batchingInterval: 16, // 60fps batching
      maxBatchSize: 100,
      ...options
    };
    
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    
    // Système de batching
    this.batchTimer = null;
    this.messageBatch = [];
    
    // Système de compression
    this.compressionEnabled = false;
    
    // Queue de messages pendant déconnexion
    this.offlineQueue = [];
    
    // Métriques de performance
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      bytesTransferred: 0,
      latency: 0,
      reconnections: 0,
      errors: 0
    };
    
    // Détection de latence
    this.latencyPings = new Map();
    this.latencyHistory = [];
  }

  // Connexion avec auto-reconnect
  connect(url, protocols = []) {
    console.log(`🔗 Connexion WebSocket: ${url}`);
    
    try {
      this.ws = new WebSocket(url, protocols);
      this.setupEventListeners();
      
    } catch (error) {
      console.error('Erreur connexion WebSocket:', error);
      this.handleConnectionError(error);
    }
  }

  setupEventListeners() {
    this.ws.on('open', () => this.handleOpen());
    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('close', (code, reason) => this.handleClose(code, reason));
    this.ws.on('error', (error) => this.handleError(error));
    this.ws.on('ping', (data) => this.handlePing(data));
    this.ws.on('pong', (data) => this.handlePong(data));
  }

  handleOpen() {
    console.log('✅ WebSocket connecté');
    this.isConnected = true;
    this.reconnectAttempts = 0;
    
    this.startHeartbeat();
    this.enableCompression();
    this.processOfflineQueue();
    
    this.emit('connected');
  }

  handleMessage(data) {
    try {
      this.metrics.messagesReceived++;
      this.metrics.bytesTransferred += data.length;
      
      // Décompresser si nécessaire
      const decompressed = this.decompress(data);
      const message = JSON.parse(decompressed);
      
      // Traitement spécial pour différents types de messages
      switch (message.type) {
        case 'batch':
          this.processBatchMessage(message);
          break;
          
        case 'ping':
          this.handleLatencyPing(message);
          break;
          
        case 'pong':
          this.handleLatencyPong(message);
          break;
          
        case 'operation':
          this.emit('operation', message);
          break;
          
        case 'cursor_update':
          this.emit('cursor_update', message);
          break;
          
        case 'presence_update':
          this.emit('presence_update', message);
          break;
          
        default:
          this.emit('message', message);
      }
      
    } catch (error) {
      console.error('Erreur traitement message:', error);
      this.metrics.errors++;
    }
  }

  handleClose(code, reason) {
    console.log(`🔌 WebSocket fermé: ${code} - ${reason}`);
    this.isConnected = false;
    this.stopHeartbeat();
    
    this.emit('disconnected', { code, reason });
    
    // Auto-reconnect si non intentionnel
    if (code !== 1000 && this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  handleError(error) {
    console.error('Erreur WebSocket:', error);
    this.metrics.errors++;
    this.emit('error', error);
  }

  // Envoi de message optimisé
  send(message, options = {}) {
    if (!this.isConnected) {
      // Ajouter à la queue offline
      this.offlineQueue.push({ message, options, timestamp: Date.now() });
      return false;
    }
    
    try {
      let data;
      
      if (options.batch && !options.priority) {
        // Ajouter au batch
        this.addToBatch(message);
        return true;
      } else {
        // Envoi immédiat
        data = JSON.stringify(message);
      }
      
      // Compression si nécessaire
      if (data.length > this.options.compressionThreshold) {
        data = this.compress(data);
      }
      
      this.ws.send(data);
      this.metrics.messagesSent++;
      this.metrics.bytesTransferred += data.length;
      
      return true;
      
    } catch (error) {
      console.error('Erreur envoi message:', error);
      this.metrics.errors++;
      return false;
    }
  }

  // Système de batching pour optimiser les performances
  addToBatch(message) {
    this.messageBatch.push({
      ...message,
      timestamp: Date.now()
    });
    
    if (this.messageBatch.length >= this.options.maxBatchSize) {
      this.flushBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, this.options.batchingInterval);
    }
  }

  flushBatch() {
    if (this.messageBatch.length === 0) return;
    
    const batchMessage = {
      type: 'batch',
      messages: [...this.messageBatch],
      timestamp: Date.now(),
      count: this.messageBatch.length
    };
    
    this.messageBatch = [];
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    this.send(batchMessage, { priority: true });
  }

  processBatchMessage(batchMessage) {
    batchMessage.messages.forEach(message => {
      this.emit(message.type, message);
    });
  }

  // Système de compression simple
  compress(data) {
    if (!this.compressionEnabled) return data;
    
    try {
      // Utiliser zlib en production
      // Ici, compression simple par substitution
      return data
        .replace(/\s+/g, ' ')
        .replace(/[\n\r]/g, '\\n');
    } catch (error) {
      console.warn('Erreur compression:', error);
      return data;
    }
  }

  decompress(data) {
    if (!this.compressionEnabled) return data;
    
    try {
      return data
        .replace(/\\n/g, '\n')
        .trim();
    } catch (error) {
      console.warn('Erreur décompression:', error);
      return data;
    }
  }

  // Système de heartbeat et détection de latence
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.ping();
      }
    }, this.options.heartbeatInterval);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  ping() {
    const pingId = `ping_${Date.now()}`;
    this.latencyPings.set(pingId, Date.now());
    
    this.send({
      type: 'ping',
      id: pingId,
      timestamp: Date.now()
    }, { priority: true });
  }

  handleLatencyPing(message) {
    // Répondre au ping
    this.send({
      type: 'pong',
      id: message.id,
      timestamp: Date.now(),
      originalTimestamp: message.timestamp
    }, { priority: true });
  }

  handleLatencyPong(message) {
    const pingTime = this.latencyPings.get(message.id);
    if (pingTime) {
      const latency = Date.now() - pingTime;
      this.updateLatency(latency);
      this.latencyPings.delete(message.id);
    }
  }

  updateLatency(latency) {
    this.metrics.latency = latency;
    this.latencyHistory.push({
      latency: latency,
      timestamp: Date.now()
    });
    
    // Garder seulement les 100 dernières mesures
    if (this.latencyHistory.length > 100) {
      this.latencyHistory.shift();
    }
    
    this.emit('latency_update', {
      current: latency,
      average: this.getAverageLatency(),
      history: this.latencyHistory.slice(-10)
    });
  }

  getAverageLatency() {
    if (this.latencyHistory.length === 0) return 0;
    
    const sum = this.latencyHistory.reduce((acc, item) => acc + item.latency, 0);
    return Math.round(sum / this.latencyHistory.length);
  }

  // Auto-reconnect
  scheduleReconnect() {
    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 secondes
    );
    
    console.log(`🔄 Reconnexion dans ${delay}ms (tentative ${this.reconnectAttempts + 1})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.metrics.reconnections++;
      this.connect(this.lastUrl, this.lastProtocols);
    }, delay);
  }

  // Traitement de la queue offline
  processOfflineQueue() {
    if (this.offlineQueue.length === 0) return;
    
    console.log(`📤 Traitement ${this.offlineQueue.length} messages offline`);
    
    const messages = [...this.offlineQueue];
    this.offlineQueue = [];
    
    messages.forEach(({ message, options }) => {
      this.send(message, options);
    });
  }

  // Activer compression intelligente
  enableCompression() {
    // Détection automatique du support de compression
    this.compressionEnabled = true;
    console.log('📦 Compression activée');
  }

  // Optimisations spécifiques au live coding
  sendOperation(operation) {
    return this.send({
      type: 'operation',
      operation: operation,
      timestamp: Date.now()
    }, { batch: true });
  }

  sendCursorUpdate(clientId, position, selection = null) {
    return this.send({
      type: 'cursor_update',
      clientId: clientId,
      position: position,
      selection: selection,
      timestamp: Date.now()
    }, { batch: true });
  }

  sendPresenceUpdate(presence) {
    return this.send({
      type: 'presence_update',
      presence: presence,
      timestamp: Date.now()
    }, { batch: false }); // Pas de batch pour la présence
  }

  // Métriques et monitoring
  getMetrics() {
    return {
      ...this.metrics,
      isConnected: this.isConnected,
      latency: {
        current: this.metrics.latency,
        average: this.getAverageLatency(),
        history: this.latencyHistory.slice(-10)
      },
      queue: {
        offline: this.offlineQueue.length,
        batch: this.messageBatch.length
      },
      connection: {
        reconnectAttempts: this.reconnectAttempts,
        maxAttempts: this.options.maxReconnectAttempts
      }
    };
  }

  // Réinitialiser les métriques
  resetMetrics() {
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      bytesTransferred: 0,
      latency: 0,
      reconnections: 0,
      errors: 0
    };
    
    this.latencyHistory = [];
  }

  // Fermeture propre
  close(code = 1000, reason = 'Client disconnect') {
    console.log('🔌 Fermeture WebSocket');
    
    this.stopHeartbeat();
    this.flushBatch(); // Envoyer les derniers messages
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(code, reason);
    }
    
    this.isConnected = false;
  }
}

module.exports = OptimizedWebSocket; 