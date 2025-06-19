// Système d'authentification simple pour les sessions
const crypto = require('crypto');

class AuthManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> {password, created, clients}
  }

  // Générer un mot de passe de session
  generateSessionPassword() {
    return crypto.randomBytes(4).toString('hex').toUpperCase(); // Ex: A1B2C3D4
  }

  // Créer une session protégée
  createSecureSession(sessionId) {
    const password = this.generateSessionPassword();
    this.sessions.set(sessionId, {
      password: password,
      created: Date.now(),
      clients: new Set()
    });
    return password;
  }

  // Vérifier l'accès à une session
  validateSession(sessionId, password) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    return session.password === password.toUpperCase();
  }

  // Nettoyer les sessions expirées (24h)
  cleanExpiredSessions() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 heures

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.created > maxAge) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

module.exports = AuthManager; 