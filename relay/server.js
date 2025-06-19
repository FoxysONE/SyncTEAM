// Serveur de relais pour éviter l'ouverture de ports
const WebSocket = require('ws');
const http = require('http');

class RelayServer {
  constructor(port = 3000) {
    this.port = port;
    this.rooms = new Map(); // sessionId -> {host: ws, clients: Set<ws>}
    this.connections = new Map(); // ws -> {sessionId, role}
    
    this.startServer();
  }
  
  startServer() {
    const server = http.createServer();
    this.wss = new WebSocket.Server({ server });
    
    this.wss.on('connection', (ws) => {
      console.log('🔗 Nouvelle connexion');
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('Erreur message:', error);
        }
      });
      
      ws.on('close', () => {
        this.handleDisconnection(ws);
      });
      
      ws.on('error', (error) => {
        console.error('Erreur WebSocket:', error);
        this.handleDisconnection(ws);
      });
    });
    
    server.listen(this.port, () => {
      console.log(`🌐 Serveur de relais démarré sur le port ${this.port}`);
    });
  }
  
  handleMessage(ws, message) {
    switch (message.type) {
      case 'create_room':
        this.createRoom(ws, message.sessionId);
        break;
        
      case 'join_room':
        this.joinRoom(ws, message.sessionId);
        break;
        
      case 'relay_data':
        this.relayData(ws, message);
        break;
        
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  }
  
  createRoom(ws, sessionId) {
    if (this.rooms.has(sessionId)) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Session déjà existante' 
      }));
      return;
    }
    
    this.rooms.set(sessionId, {
      host: ws,
      clients: new Set()
    });
    
    this.connections.set(ws, {
      sessionId: sessionId,
      role: 'host'
    });
    
    ws.send(JSON.stringify({
      type: 'room_created',
      sessionId: sessionId
    }));
    
    console.log(`🏠 Room créée: ${sessionId}`);
  }
  
  joinRoom(ws, sessionId) {
    const room = this.rooms.get(sessionId);
    if (!room) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Session introuvable'
      }));
      return;
    }
    
    room.clients.add(ws);
    this.connections.set(ws, {
      sessionId: sessionId,
      role: 'client'
    });
    
    ws.send(JSON.stringify({
      type: 'room_joined',
      sessionId: sessionId
    }));
    
    // Notifier l'hôte
    room.host.send(JSON.stringify({
      type: 'client_joined',
      clientCount: room.clients.size
    }));
    
    console.log(`👤 Client rejoint la room: ${sessionId}`);
  }
  
  relayData(ws, message) {
    const connection = this.connections.get(ws);
    if (!connection) return;
    
    const room = this.rooms.get(connection.sessionId);
    if (!room) return;
    
    const relayMessage = {
      type: 'relayed_data',
      data: message.data,
      from: connection.role
    };
    
    if (connection.role === 'host') {
      // Envoyer à tous les clients
      room.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(relayMessage));
        }
      });
    } else {
      // Envoyer à l'hôte
      if (room.host.readyState === WebSocket.OPEN) {
        room.host.send(JSON.stringify(relayMessage));
      }
    }
  }
  
  handleDisconnection(ws) {
    const connection = this.connections.get(ws);
    if (!connection) return;
    
    const room = this.rooms.get(connection.sessionId);
    if (!room) return;
    
    if (connection.role === 'host') {
      // Fermer la room
      room.clients.forEach(client => {
        client.send(JSON.stringify({
          type: 'room_closed',
          message: 'Hôte déconnecté'
        }));
        client.close();
      });
      this.rooms.delete(connection.sessionId);
      console.log(`🏠 Room fermée: ${connection.sessionId}`);
    } else {
      // Retirer le client
      room.clients.delete(ws);
      room.host.send(JSON.stringify({
        type: 'client_left',
        clientCount: room.clients.size
      }));
      console.log(`👋 Client quitté: ${connection.sessionId}`);
    }
    
    this.connections.delete(ws);
  }
}

// Démarrer le serveur si ce fichier est exécuté directement
if (require.main === module) {
  new RelayServer(process.env.PORT || 3000);
}

module.exports = RelayServer; 