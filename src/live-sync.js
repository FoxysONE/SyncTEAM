// Système de synchronisation live coding avec Operational Transformation
const EventEmitter = require('events');
const WebSocket = require('ws');

class LiveSyncEngine extends EventEmitter {
  constructor(configManager) {
    super();
    this.configManager = configManager;
    this.documents = new Map(); // fileName -> DocumentState
    this.clients = new Map(); // clientId -> ClientState
    this.operationQueue = [];
    this.globalRevision = 0;
    
    // Curseurs et sélections en temps réel
    this.cursors = new Map(); // clientId -> CursorState
    this.selections = new Map(); // clientId -> SelectionState
    
    // Système de présence
    this.presence = new Map(); // clientId -> PresenceInfo
    
    // Optimisation : batch les opérations toutes les 16ms (60fps)
    this.batchTimer = null;
    this.pendingOperations = [];
    
    // Historique des opérations pour les métriques
    this.operationHistory = [];
    this.metricsInterval = null;
    
    // Métriques de performance
    this.metrics = {
      operationsPerSecond: 0,
      averageLatency: 0,
      activeConnections: 0,
      totalOperations: 0
    };
    
    // Démarrer les métriques
    this.startMetricsCollection();
  }

  // Initialiser un document pour le live coding
  initializeDocument(fileName, content) {
    const docState = {
      content: content,
      revision: 0,
      operations: [], // Historique des opérations
      clients: new Set(),
      locks: new Map(), // Zones verrouillées par client
      annotations: new Map() // Commentaires/annotations
    };
    
    this.documents.set(fileName, docState);
    console.log(`📄 Document initialisé: ${fileName}`);
  }

  // Ajouter un client au live coding
  addClient(clientId, userName, avatar = null) {
    const clientState = {
      id: clientId,
      userName: userName,
      avatar: avatar,
      activeDocument: null,
      revision: 0,
      color: this.generateClientColor(clientId),
      lastSeen: Date.now(),
      isTyping: false
    };
    
    this.clients.set(clientId, clientState);
    this.presence.set(clientId, {
      ...clientState,
      status: 'online',
      currentFile: null,
      cursor: null
    });
    
    this.broadcastPresenceUpdate();
    console.log(`👤 Client ajouté: ${userName} (${clientId})`);
  }

  // Appliquer une opération de texte (caractère par caractère)
  applyTextOperation(clientId, fileName, operation) {
    const doc = this.documents.get(fileName);
    const client = this.clients.get(clientId);
    
    if (!doc || !client) return false;

    // Transformer l'opération selon l'état actuel
    const transformedOp = this.transformOperation(operation, doc.revision);
    
    // Appliquer l'opération
    const result = this.executeOperation(doc, transformedOp);
    
    if (result.success) {
      // Mettre à jour la révision
      doc.revision++;
      this.globalRevision++;
      
      // Ajouter à l'historique
      doc.operations.push({
        ...transformedOp,
        clientId: clientId,
        timestamp: Date.now(),
        revision: doc.revision
      });
      
      // Batch les opérations pour l'envoi
      this.queueOperation({
        type: 'text_operation',
        fileName: fileName,
        operation: transformedOp,
        clientId: clientId,
        revision: doc.revision
      });
      
      return true;
    }
    
    return false;
  }

  // Système d'Operational Transformation
  transformOperation(operation, currentRevision) {
    const doc = this.documents.get(operation.fileName);
    if (!doc) return operation;
    
    // Récupérer les opérations concurrentes
    const concurrentOps = doc.operations.filter(op => 
      op.revision > operation.baseRevision
    );
    
    let transformedOp = { ...operation };
    
    // Transformer contre chaque opération concurrente
    concurrentOps.forEach(concurrentOp => {
      transformedOp = this.transformAgainst(transformedOp, concurrentOp);
    });
    
    return transformedOp;
  }

  // Transformer une opération contre une autre
  transformAgainst(op1, op2) {
    // Différents types d'opérations
    if (op1.type === 'insert' && op2.type === 'insert') {
      return this.transformInsertInsert(op1, op2);
    } else if (op1.type === 'insert' && op2.type === 'delete') {
      return this.transformInsertDelete(op1, op2);
    } else if (op1.type === 'delete' && op2.type === 'insert') {
      return this.transformDeleteInsert(op1, op2);
    } else if (op1.type === 'delete' && op2.type === 'delete') {
      return this.transformDeleteDelete(op1, op2);
    }
    
    return op1;
  }

  // Transformer insertion vs insertion
  transformInsertInsert(op1, op2) {
    if (op1.position <= op2.position) {
      return op1; // Pas de transformation nécessaire
    } else {
      return {
        ...op1,
        position: op1.position + op2.text.length
      };
    }
  }

  // Transformer insertion vs suppression
  transformInsertDelete(op1, op2) {
    if (op1.position <= op2.position) {
      return op1;
    } else if (op1.position >= op2.position + op2.length) {
      return {
        ...op1,
        position: op1.position - op2.length
      };
    } else {
      // Insertion au milieu de la suppression
      return {
        ...op1,
        position: op2.position
      };
    }
  }

  // Exécuter une opération sur un document
  executeOperation(doc, operation) {
    try {
      let newContent = doc.content;
      
      switch (operation.type) {
        case 'insert':
          newContent = 
            newContent.slice(0, operation.position) +
            operation.text +
            newContent.slice(operation.position);
          break;
          
        case 'delete':
          newContent = 
            newContent.slice(0, operation.position) +
            newContent.slice(operation.position + operation.length);
          break;
          
        case 'replace':
          newContent = 
            newContent.slice(0, operation.position) +
            operation.newText +
            newContent.slice(operation.position + operation.oldLength);
          break;
      }
      
      doc.content = newContent;
      return { success: true, content: newContent };
      
    } catch (error) {
      console.error('Erreur exécution opération:', error);
      return { success: false, error: error.message };
    }
  }

  // Mettre à jour la position du curseur
  updateCursor(clientId, fileName, position, selection = null) {
    const cursorState = {
      clientId: clientId,
      fileName: fileName,
      position: position,
      selection: selection,
      timestamp: Date.now()
    };
    
    this.cursors.set(clientId, cursorState);
    
    // Mettre à jour la présence
    const presence = this.presence.get(clientId);
    if (presence) {
      presence.currentFile = fileName;
      presence.cursor = position;
      presence.lastSeen = Date.now();
    }
    
    this.queueOperation({
      type: 'cursor_update',
      clientId: clientId,
      fileName: fileName,
      position: position,
      selection: selection
    });
  }

  // Système de verrouillage optimiste des lignes
  requestLineLock(clientId, fileName, lineNumber) {
    const doc = this.documents.get(fileName);
    if (!doc) return false;
    
    // Vérifier si la ligne est déjà verrouillée
    const existingLock = doc.locks.get(lineNumber);
    if (existingLock && existingLock.clientId !== clientId) {
      return false; // Ligne déjà verrouillée par un autre client
    }
    
    // Verrouiller la ligne
    doc.locks.set(lineNumber, {
      clientId: clientId,
      timestamp: Date.now(),
      autoRelease: setTimeout(() => {
        doc.locks.delete(lineNumber);
        this.broadcastLockUpdate(fileName, lineNumber, null);
      }, 30000) // Auto-release après 30s
    });
    
    this.broadcastLockUpdate(fileName, lineNumber, clientId);
    return true;
  }

  // Libérer le verrouillage d'une ligne
  releaseLineLock(clientId, fileName, lineNumber) {
    const doc = this.documents.get(fileName);
    if (!doc) return;
    
    const lock = doc.locks.get(lineNumber);
    if (lock && lock.clientId === clientId) {
      clearTimeout(lock.autoRelease);
      doc.locks.delete(lineNumber);
      this.broadcastLockUpdate(fileName, lineNumber, null);
    }
  }

  // Système d'annotations/commentaires en temps réel
  addAnnotation(clientId, fileName, position, text, type = 'comment') {
    const doc = this.documents.get(fileName);
    if (!doc) return false;
    
    const annotationId = `${clientId}_${Date.now()}`;
    const annotation = {
      id: annotationId,
      clientId: clientId,
      fileName: fileName,
      position: position,
      text: text,
      type: type, // comment, suggestion, error, warning
      timestamp: Date.now(),
      resolved: false
    };
    
    doc.annotations.set(annotationId, annotation);
    
    this.queueOperation({
      type: 'annotation_added',
      annotation: annotation
    });
    
    return annotationId;
  }

  // Gestion des opérations en batch (60fps)
  queueOperation(operation) {
    this.pendingOperations.push(operation);
    
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushOperations();
      }, 16); // ~60fps
    }
  }

  // Envoyer toutes les opérations en attente
  flushOperations() {
    if (this.pendingOperations.length > 0) {
      const batch = [...this.pendingOperations];
      this.pendingOperations = [];
      
      this.emit('operations_batch', {
        operations: batch,
        timestamp: Date.now(),
        revision: this.globalRevision
      });
    }
    
    this.batchTimer = null;
  }

  // Générer une couleur unique pour chaque client
  generateClientColor(clientId) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
      '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
      '#C44569', '#F8B500', '#6C5CE7', '#A29BFE', '#FD79A8'
    ];
    
    // Hash simple du clientId pour choisir une couleur
    let hash = 0;
    for (let i = 0; i < clientId.length; i++) {
      hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  // Diffuser les mises à jour de présence
  broadcastPresenceUpdate() {
    const presenceList = Array.from(this.presence.values());
    this.emit('presence_update', presenceList);
  }

  // Diffuser les mises à jour de verrouillage
  broadcastLockUpdate(fileName, lineNumber, clientId) {
    this.emit('lock_update', {
      fileName: fileName,
      lineNumber: lineNumber,
      clientId: clientId,
      timestamp: Date.now()
    });
  }

  // Obtenir l'état complet d'un document
  getDocumentState(fileName) {
    const doc = this.documents.get(fileName);
    if (!doc) return null;
    
    return {
      fileName: fileName,
      content: doc.content,
      revision: doc.revision,
      cursors: Array.from(this.cursors.values()).filter(c => c.fileName === fileName),
      locks: Array.from(doc.locks.entries()).map(([line, lock]) => ({
        lineNumber: line,
        clientId: lock.clientId
      })),
      annotations: Array.from(doc.annotations.values()),
      clients: Array.from(doc.clients)
    };
  }

  // Nettoyer les clients déconnectés
  cleanupInactiveClients() {
    const now = Date.now();
    const timeout = 60000; // 1 minute
    
    for (const [clientId, presence] of this.presence.entries()) {
      if (now - presence.lastSeen > timeout) {
        this.removeClient(clientId);
      }
    }
  }

  // Supprimer un client
  removeClient(clientId) {
    // Libérer tous les verrous du client
    for (const [fileName, doc] of this.documents.entries()) {
      const locksToRelease = [];
      for (const [lineNumber, lock] of doc.locks.entries()) {
        if (lock.clientId === clientId) {
          locksToRelease.push(lineNumber);
        }
      }
      
      locksToRelease.forEach(lineNumber => {
        this.releaseLineLock(clientId, fileName, lineNumber);
      });
    }
    
    // Supprimer de toutes les structures
    this.clients.delete(clientId);
    this.presence.delete(clientId);
    this.cursors.delete(clientId);
    
    this.broadcastPresenceUpdate();
    console.log(`👋 Client supprimé: ${clientId}`);
  }

  // Méthodes utilitaires manquantes
  findLineStart(content, offset) {
    return content.lastIndexOf('\n', offset - 1) + 1;
  }

  findLineEnd(content, offset) {
    const nextNewline = content.indexOf('\n', offset);
    return nextNewline === -1 ? content.length : nextNewline;
  }

  generateSharedCursorStyle(clientId) {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FD79A8'];
    const color = colors[clientId % colors.length];
    
    return {
      color: color,
      background: color + '20',
      borderColor: color
    };
  }

  transformSelection(selection, operation) {
    if (!selection || !operation) return selection;
    
    const { start, end } = selection;
    const { position, length, type } = operation;
    
    let newStart = start;
    let newEnd = end;
    
    if (type === 'insert') {
      if (position <= start) {
        newStart += length;
        newEnd += length;
      } else if (position < end) {
        newEnd += length;
      }
    } else if (type === 'delete') {
      if (position + length <= start) {
        newStart -= length;
        newEnd -= length;
      } else if (position < end) {
        if (position < start) {
          const deletedBeforeStart = Math.min(length, start - position);
          newStart -= deletedBeforeStart;
          newEnd -= deletedBeforeStart;
          
          const deletedInSelection = Math.min(length - deletedBeforeStart, end - start);
          newEnd -= deletedInSelection;
        } else {
          const deletedInSelection = Math.min(length, end - position);
          newEnd -= deletedInSelection;
        }
      }
    }
    
    return { start: Math.max(0, newStart), end: Math.max(0, newEnd) };
  }

  validateOperation(operation) {
    if (!operation || typeof operation !== 'object') return false;
    
    const required = ['type', 'position', 'content', 'timestamp', 'clientId'];
    return required.every(field => operation.hasOwnProperty(field));
  }

  normalizeOperation(operation) {
    return {
      ...operation,
      timestamp: operation.timestamp || Date.now(),
      id: operation.id || this.generateOperationId()
    };
  }

  generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  isWithinLockedRegion(position, lockedRegions) {
    return lockedRegions.some(region => 
      position >= region.start && position <= region.end
    );
  }

  createLockRequest(start, end, clientId) {
    return {
      type: 'lock_request',
      start,
      end,
      clientId,
      timestamp: Date.now(),
      id: this.generateOperationId()
    };
  }

  handleLockConflict(existingLock, newLock) {
    // Stratégie simple : le premier arrivé garde le verrou
    return {
      granted: false,
      reason: 'Region already locked',
      existingLock
    };
  }

  updateMetrics(operationType) {
    if (!this.performanceMetrics[operationType]) {
      this.performanceMetrics[operationType] = {
        count: 0,
        totalTime: 0,
        maxTime: 0
      };
    }
    
    this.performanceMetrics[operationType].count++;
  }

  getConnectionStatus() {
    return {
      connected: this.wsOptimized ? this.wsOptimized.isConnected() : false,
      clientsCount: this.clients.size,
      lastSync: this.lastSyncTime
    };
  }

  broadcastToOthers(data, excludeClientId) {
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId) {
        client.send(JSON.stringify(data));
      }
    });
  }

  cleanupOldOperations() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 heures
    this.operationHistory = this.operationHistory.filter(op => op.timestamp > cutoff);
  }

  getOperationById(operationId) {
    return this.operationHistory.find(op => op.id === operationId);
  }

  // Méthodes pour les statistiques
  getStatistics() {
    return {
      totalOperations: this.operationHistory.length,
      activeClients: this.clients.size,
      averageLatency: this.calculateAverageLatency(),
      operationsPerSecond: this.calculateOpsPerSecond(),
      errorRate: this.calculateErrorRate()
    };
  }

  calculateAverageLatency() {
    if (this.operationHistory.length === 0) return 0;
    
    const latencies = this.operationHistory
      .filter(op => op.latency)
      .map(op => op.latency);
    
    return latencies.length > 0 
      ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length 
      : 0;
  }

  calculateOpsPerSecond() {
    const now = Date.now();
    const lastMinute = now - 60000;
    const recentOps = this.operationHistory.filter(op => op.timestamp > lastMinute);
    
    return recentOps.length;
  }

  calculateErrorRate() {
    if (this.operationHistory.length === 0) return 0;
    
    const errors = this.operationHistory.filter(op => op.error).length;
    return (errors / this.operationHistory.length) * 100;
  }

  // Démarrer le serveur live coding
  startLiveCodingServer() {
    const config = this.configManager.getConfig();
    const serverConfig = config.server;
    
    // Vérifier si le serveur doit être démarré
    if (!serverConfig.enabled || !serverConfig.autoStart) {
      console.log('🔒 Serveur live coding désactivé (mode local uniquement)');
      return;
    }

    // Déterminer l'host selon le mode
    let host = 'localhost'; // Par défaut local
    
    if (config.networkMode === 'network') {
      host = '0.0.0.0'; // Écoute sur toutes les interfaces
      console.log('🌐 Mode réseau activé - Ports requis dans le firewall');
    } else if (config.networkMode === 'auto') {
      // Auto-détection basée sur la présence d'autres machines
      host = this.shouldEnableNetworkMode() ? '0.0.0.0' : 'localhost';
    } else {
      console.log('🔒 Mode local uniquement - Aucun port à ouvrir');
    }

    this.server = new WebSocket.Server({ 
      port: serverConfig.port, 
      host: host,
      perMessageDeflate: false 
    });

    console.log(`🚀 Serveur live coding sur ${host}:${serverConfig.port}`);
    
    if (host === '0.0.0.0') {
      const networkInterfaces = require('os').networkInterfaces();
      Object.keys(networkInterfaces).forEach(interfaceName => {
        networkInterfaces[interfaceName].forEach(iface => {
          if (iface.family === 'IPv4' && !iface.internal) {
            console.log(`🌐 Accessible depuis: ${iface.address}:${serverConfig.port}`);
          }
        });
      });
    } else {
      console.log(`🏠 Accessible uniquement en local: localhost:${serverConfig.port}`);
    }
  }

  // Arrêter le serveur
  stopServer() {
    if (this.server) {
      console.log('🛑 Arrêt du serveur live coding...');
      this.server.close();
      this.server = null;
      
      // Fermer toutes les connexions clients
      this.clients.forEach((client, id) => {
        if (client.ws && client.ws.readyState === WebSocket.OPEN) {
          client.ws.close();
        }
      });
      this.clients.clear();
      
      console.log('✅ Serveur arrêté');
    }
  }

  // Déterminer si le mode réseau doit être activé automatiquement
  shouldEnableNetworkMode() {
    // Logique simple : si plus de 0 clients connectés récemment
    return this.metrics.activeConnections > 0;
  }

  // Démarrer la collecte de métriques
  startMetricsCollection() {
    // Collecter les métriques toutes les secondes
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, 1000);
    
    console.log('📊 Collecte de métriques démarrée');
  }

  // Mettre à jour les métriques
  updateMetrics() {
    // Calculer les opérations par seconde
    const now = Date.now();
    const recentOps = this.operationHistory.filter(op => now - op.timestamp < 1000);
    this.metrics.operationsPerSecond = recentOps.length;
    
    // Calculer la latence moyenne
    if (recentOps.length > 0) {
      const totalLatency = recentOps.reduce((sum, op) => sum + (op.latency || 0), 0);
      this.metrics.averageLatency = totalLatency / recentOps.length;
    }
    
    // Compter les connexions actives
    this.metrics.activeConnections = this.clients.size;
    
    // Total des opérations
    this.metrics.totalOperations = this.operationHistory.length;
  }

  // Arrêter la collecte de métriques
  stopMetricsCollection() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
      console.log('📊 Collecte de métriques arrêtée');
    }
  }

  // Nettoyage complet lors de la fermeture
  cleanup() {
    console.log('🧹 Nettoyage LiveSyncEngine...');
    
    // Arrêter le serveur
    this.stopServer();
    
    // Arrêter les métriques
    this.stopMetricsCollection();
    
    // Nettoyer les données
    this.documents.clear();
    this.clients.clear();
    this.operationHistory = [];
    this.lineLocks.clear();
    this.annotations.clear();
    
    console.log('✅ LiveSyncEngine nettoyé');
  }
}

module.exports = LiveSyncEngine; 