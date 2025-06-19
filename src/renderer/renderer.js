const { ipcRenderer } = require('electron');

// État global de l'application
let appState = {
    isConnected: false,
    isHost: false,
    projectPath: '',
    projectFiles: new Map(), // Map<filePath, {status, lastModified, size}>
    activity: [],
    connectedClients: 0
};

// Gestionnaire d'événements pour le nettoyage
let eventListeners = [];

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    updateUI();
});

// Nettoyage lors de la fermeture
window.addEventListener('beforeunload', () => {
    cleanup();
});

function cleanup() {
    // Nettoyer tous les event listeners
    eventListeners.forEach(({ event, handler }) => {
        ipcRenderer.removeListener(event, handler);
    });
    eventListeners = [];
}

function addEventListeners(event, handler) {
    ipcRenderer.on(event, handler);
    eventListeners.push({ event, handler });
}

function initializeApp() {
    console.log('🚀 CodeSync initialisé');
    // Afficher l'écran d'accueil par défaut
    showWelcomeScreen();
}

function setupEventListeners() {
    // Écouter les mises à jour de statut du processus principal
    addEventListeners('stats-updated', (event, stats) => {
        appState = { ...appState, ...stats };
        updateUI();
        updateConnectionStatus();
    });

    // Écouter les changements de fichiers
    addEventListeners('file-changed', (event, data) => {
        handleFileChange(data);
        addActivity(`📝 ${getActionIcon(data.action)} ${data.file}`, data.action);
    });

    // Écouter la synchronisation complète
    addEventListeners('sync-complete', (event, data) => {
        showNotification(`✅ Synchronisation terminée! ${data.fileCount} fichiers`, 'success');
        addActivity(`🔄 Sync complète: ${data.fileCount} fichiers`, 'sync');
        // Rafraîchir la liste des fichiers
        setTimeout(() => refreshFileList(), 500);
    });

    // Écouter les erreurs
    addEventListeners('sync-error', (event, error) => {
        showNotification(`❌ Erreur: ${error.message}`, 'error');
        addActivity(`⚠️ Erreur: ${error.message}`, 'error');
    });
    
    // Configurer les événements de mise à jour
    setupUpdateEventListeners();
}

// Gestion des fichiers
function handleFileChange(data) {
    const { action, filePath, timestamp, origin } = data;
    
    // **NOTIFICATION EN TEMPS RÉEL**
    let actionText = '';
    let emoji = '';
    
    switch(action) {
        case 'change':
            actionText = 'modifié';
            emoji = '✏️';
            break;
        case 'add':
            actionText = 'ajouté';
            emoji = '➕';
            break;
        case 'delete':
            actionText = 'supprimé';
            emoji = '🗑️';
            break;
    }
    
    const originText = origin === 'server' ? 'SERVEUR' : 'CLIENT';
    const message = `${emoji} ${filePath} ${actionText} (${originText})`;
    
    // Afficher notification selon l'origine
    if (origin !== 'server' && !appState.isHost) {
        // Client qui reçoit du serveur
        showNotification(message, 'info');
        addActivity(`📥 ${message}`, 'sync');
    } else if (origin !== 'client' && appState.isHost) {
        // Serveur qui reçoit d'un client
        showNotification(message, 'success');
        addActivity(`📤 ${message}`, 'sync');
    } else {
        // Changement local
        addActivity(`📝 ${message}`, 'local');
    }
    
    // Mettre à jour l'état du fichier
    if (action === 'delete') {
        appState.projectFiles.delete(filePath);
    } else {
        appState.projectFiles.set(filePath, {
            status: 'syncing',
            lastModified: timestamp,
            action: action,
            origin: origin
        });
        
        // **AUTO-SYNC : Marquer comme synchronisé après un délai**
        setTimeout(() => {
            if (appState.projectFiles.has(filePath)) {
                appState.projectFiles.set(filePath, {
                    ...appState.projectFiles.get(filePath),
                    status: 'synced'
                });
                updateFileList();
            }
        }, 500);
    }
    
    updateFileList();
    
    // **STATISTIQUES EN TEMPS RÉEL**
    updateSyncStats();
}

function refreshFileList() {
    if (!appState.projectPath) return;
    
    // Simuler la récupération de la liste des fichiers
    // En réalité, cela devrait venir du processus principal
    addActivity('🔄 Actualisation de la liste des fichiers', 'info');
}

// Interface utilisateur
function updateUI() {
    updateStatusIndicator();
    updateProjectInfo();
    updateConnectionInfo();
    updateButtons();
    
    // Afficher le dashboard si connecté ou projet sélectionné
    if (appState.projectPath || appState.isConnected) {
        showDashboard();
    } else {
        showWelcomeScreen();
    }
}

function updateStatusIndicator() {
    const statusEl = document.getElementById('status');
    
    if (appState.isHost) {
        statusEl.textContent = `🖥️ Serveur actif (${appState.connectedClients} clients)`;
        statusEl.className = 'hosting';
    } else if (appState.isConnected) {
        statusEl.textContent = '🔗 Connecté au serveur';
        statusEl.className = 'connected';
    } else {
        statusEl.textContent = '⚫ Déconnecté';
        statusEl.className = '';
    }
}

function updateProjectInfo() {
    const projectInfoEl = document.getElementById('projectInfo');
    const openBtnEl = document.getElementById('openBtn');
    
    if (appState.projectPath) {
        const projectName = appState.projectPath.split(/[\\\/]/).pop();
        projectInfoEl.innerHTML = `
            <strong>${projectName}</strong><br>
            <small style="color: var(--text-muted);">${appState.projectPath}</small>
        `;
        openBtnEl.disabled = false;
    } else {
        projectInfoEl.textContent = 'Aucun projet sélectionné';
        openBtnEl.disabled = true;
    }
}

function updateConnectionInfo() {
    const connectionInfoEl = document.getElementById('connectionInfo');
    const clientsInfoEl = document.getElementById('clientsInfo');
    const serverInfoEl = document.getElementById('serverInfo');
    
    if (appState.isHost) {
        connectionInfoEl.innerHTML = '<strong>🖥️ Mode Serveur</strong>';
        clientsInfoEl.textContent = `${appState.connectedClients} clients connectés`;
        serverInfoEl.textContent = `Port: 8080 | Vous êtes l\'hôte`;
    } else if (appState.isConnected) {
        connectionInfoEl.innerHTML = '<strong>🔗 Mode Client</strong>';
        clientsInfoEl.textContent = 'Connecté au serveur';
        serverInfoEl.textContent = 'Synchronisation active';
    } else {
        connectionInfoEl.textContent = 'Déconnecté';
        clientsInfoEl.textContent = '0 clients connectés';
        serverInfoEl.textContent = '';
    }
}

function updateButtons() {
    const connectBtn = document.getElementById('connectBtn');
    const hostBtn = document.getElementById('hostBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    
    if (appState.isConnected || appState.isHost) {
        connectBtn.disabled = true;
        hostBtn.disabled = true;
        disconnectBtn.disabled = false;
    } else {
        connectBtn.disabled = false;
        hostBtn.disabled = false;
        disconnectBtn.disabled = true;
    }
}

function updateFileList() {
    const fileListEl = document.getElementById('fileList');
    const fileCountEl = document.getElementById('fileCount');
    
    if (appState.projectFiles.size === 0) {
        fileListEl.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                ${appState.projectPath ? 'Aucun fichier détecté' : 'Aucun projet sélectionné'}
            </div>
        `;
        fileCountEl.textContent = '0 fichiers';
        return;
    }
    
    // **OPTIMISATION : Virtualisation pour gros projets**
    const files = Array.from(appState.projectFiles.entries()).sort(([a], [b]) => a.localeCompare(b));
    const maxVisible = 100; // Limiter à 100 fichiers visibles
    const visibleFiles = files.slice(0, maxVisible);
    
    fileCountEl.textContent = `${appState.projectFiles.size} fichiers${files.length > maxVisible ? ` (${maxVisible} affichés)` : ''}`;
    
    // **RENDU OPTIMISÉ**
    const fileItems = visibleFiles.map(([filePath, fileInfo]) => {
        const icon = getFileIcon(filePath);
        const status = fileInfo.status || 'synced';
        const statusText = getStatusText(status);
        const origin = fileInfo.origin || 'local';
        
        return `
            <div class="file-item" title="${filePath}">
                <div class="file-icon">${icon}</div>
                <div class="file-name">${filePath}</div>
                <div class="file-origin" style="font-size: 0.7rem; color: var(--text-muted);">
                    ${origin === 'server' ? '🖥️' : origin === 'client' ? '👤' : '📝'}
                </div>
                <div class="file-status ${status}">${statusText}</div>
            </div>
        `;
    }).join('');
    
    fileListEl.innerHTML = fileItems;
    
    // **SCROLL VIRTUEL** pour gros projets
    if (files.length > maxVisible) {
        const loadMoreDiv = document.createElement('div');
        loadMoreDiv.className = 'load-more';
        loadMoreDiv.innerHTML = `
            <div style="padding: 1rem; text-align: center; cursor: pointer; color: var(--accent);">
                📁 Voir plus... (+${files.length - maxVisible} fichiers)
            </div>
        `;
        loadMoreDiv.onclick = () => showAllFiles();
        fileListEl.appendChild(loadMoreDiv);
    }
}

// **NOUVEAU : Afficher tous les fichiers (modal)**
function showAllFiles() {
    const files = Array.from(appState.projectFiles.entries()).sort(([a], [b]) => a.localeCompare(b));
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px; max-height: 80vh;">
            <h3>📁 Tous les fichiers (${files.length})</h3>
            <div style="max-height: 60vh; overflow-y: auto; margin: 1rem 0;">
                ${files.map(([filePath, fileInfo]) => `
                    <div class="file-item" style="padding: 0.5rem; border-bottom: 1px solid var(--border);">
                        <span style="margin-right: 0.5rem;">${getFileIcon(filePath)}</span>
                        <span>${filePath}</span>
                        <span style="float: right; font-size: 0.8rem;">
                            ${fileInfo.origin === 'server' ? '🖥️' : fileInfo.origin === 'client' ? '👤' : '📝'}
                            <span class="file-status ${fileInfo.status || 'synced'}" style="margin-left: 0.5rem;">
                                ${getStatusText(fileInfo.status || 'synced')}
                            </span>
                        </span>
                    </div>
                `).join('')}
            </div>
            <div class="form-actions">
                <button onclick="this.closest('.modal').remove()">Fermer</button>
            </div>
        </div>
    `;
    
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    
    document.body.appendChild(modal);
}

// Écrans
function showWelcomeScreen() {
    document.getElementById('welcome').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
}

function showDashboard() {
    document.getElementById('welcome').style.display = 'none';
    document.getElementById('dashboard').style.display = 'grid';
    updateFileList();
}

// Actions utilisateur
async function selectProject() {
    try {
        const result = await ipcRenderer.invoke('select-project-folder');
        if (result.success) {
            appState.projectPath = result.path;
            showNotification('✅ Projet sélectionné avec succès!', 'success');
            addActivity(`📁 Projet sélectionné: ${result.path.split(/[\\\/]/).pop()}`, 'info');
            
            // Simuler quelques fichiers pour la démo
            setTimeout(() => {
                simulateProjectFiles();
            }, 500);
            
            updateUI();
        }
    } catch (error) {
        showNotification('❌ Erreur lors de la sélection du projet', 'error');
        addActivity('⚠️ Erreur sélection projet', 'error');
    }
}

async function startHost() {
    if (!appState.projectPath) {
        showNotification('⚠️ Veuillez d\'abord sélectionner un projet', 'warning');
        return;
    }

    try {
        addActivity('🖥️ Démarrage du serveur...', 'info');
        const result = await ipcRenderer.invoke('start-host');
        
        if (result.success) {
            showNotification(`✅ Serveur démarré sur le port ${result.port}`, 'success');
            addActivity(`🖥️ Serveur actif - Port ${result.port}`, 'success');
            
            // Simuler des fichiers du projet
            simulateProjectFiles();
        } else {
            showNotification(`❌ ${result.error}`, 'error');
            addActivity(`⚠️ Erreur serveur: ${result.error}`, 'error');
        }
    } catch (error) {
        showNotification('❌ Erreur lors du démarrage du serveur', 'error');
        addActivity('⚠️ Erreur démarrage serveur', 'error');
    }
}

function showConnect() {
    document.getElementById('connectModal').style.display = 'flex';
}

function hideConnect() {
    document.getElementById('connectModal').style.display = 'none';
}

async function connectToHost(event) {
    event.preventDefault();
    
    const hostIp = document.getElementById('hostIp').value.trim();
    
    // Validation de l'IP
    if (!hostIp) {
        showNotification('❌ Veuillez saisir une adresse IP', 'error');
        return;
    }
    
    // Validation basique de l'IP/hostname
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^localhost$|^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!ipRegex.test(hostIp)) {
        showNotification('❌ Format d\'adresse IP invalide', 'error');
        return;
    }
    
    showNotification('🔄 Connexion en cours...', 'info');
    
    try {
        const result = await ipcRenderer.invoke('connect-to-host', { ip: hostIp });
        
        if (result.success) {
            showNotification('✅ ' + result.message, 'success');
            hideConnect();
            addActivity(`🔗 Connecté à ${hostIp}`, 'success');
        } else {
            showNotification('❌ ' + result.error, 'error');
            addActivity(`❌ Échec connexion à ${hostIp}: ${result.error}`, 'error');
        }
    } catch (error) {
        showNotification('❌ Erreur de connexion: ' + error.message, 'error');
        addActivity(`❌ Erreur: ${error.message}`, 'error');
    }
}

async function disconnect() {
    try {
        await ipcRenderer.invoke('disconnect');
        showNotification('✅ Déconnecté avec succès', 'success');
        addActivity('❌ Déconnexion', 'info');
        
        // Nettoyer l'état
        appState.projectFiles.clear();
        updateUI();
    } catch (error) {
        showNotification('❌ Erreur lors de la déconnexion', 'error');
    }
}

async function openProject() {
    try {
        await ipcRenderer.invoke('open-project-folder');
        addActivity('📁 Ouverture du dossier projet', 'info');
    } catch (error) {
        showNotification('❌ Erreur lors de l\'ouverture du dossier', 'error');
    }
}

// Utilitaires
function getFileIcon(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const iconMap = {
        'js': '📄',
        'ts': '📘',
        'html': '🌐',
        'css': '🎨',
        'json': '📋',
        'md': '📝',
        'txt': '📄',
        'py': '🐍',
        'java': '☕',
        'cpp': '⚙️',
        'c': '⚙️',
        'php': '🐘',
        'rb': '💎',
        'go': '🐹',
        'rs': '🦀'
    };
    return iconMap[ext] || '📄';
}

function getStatusText(status) {
    const statusMap = {
        'synced': 'OK',
        'syncing': 'SYNC',
        'error': 'ERR',
        'new': 'NEW'
    };
    return statusMap[status] || 'OK';
}

function getActionIcon(action) {
    const iconMap = {
        'add': '➕',
        'change': '✏️',
        'delete': '🗑️'
    };
    return iconMap[action] || '📝';
}

// Statistiques de synchronisation en temps réel
function updateSyncStats() {
    const syncedCount = Array.from(appState.projectFiles.values()).filter(f => f.status === 'synced').length;
    const syncingCount = Array.from(appState.projectFiles.values()).filter(f => f.status === 'syncing').length;
    
    // Mettre à jour le statut dans l'interface
    const fileCountEl = document.getElementById('fileCount');
    if (fileCountEl) {
        if (syncingCount > 0) {
            fileCountEl.textContent = `${appState.projectFiles.size} fichiers (${syncingCount} en sync...)`;
            fileCountEl.style.color = 'var(--warning)';
        } else {
            fileCountEl.textContent = `${appState.projectFiles.size} fichiers (✅ sync)`;
            fileCountEl.style.color = 'var(--success)';
        }
    }
}

// Amélioration de l'ajout d'activités
function addActivity(message, type = 'info') {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
    
    const activity = {
        message: message,
        type: type,
        timestamp: now.getTime(),
        timeStr: timeStr
    };
    
    // Ajouter à la liste (max 50 éléments)
    appState.activity.unshift(activity);
    if (appState.activity.length > 50) {
        appState.activity.pop();
    }
    
    updateActivityDisplay();
    
    // **Auto-scroll vers le haut pour voir les nouvelles activités**
    const activityLog = document.getElementById('activityLog');
    if (activityLog) {
        activityLog.scrollTop = 0;
    }
}

function updateActivityDisplay() {
    const activityLogEl = document.getElementById('activityLog');
    if (!activityLogEl) return;
    
    if (appState.activity.length === 0) {
        activityLogEl.innerHTML = `
            <div style="color: var(--text-muted); text-align: center; padding: 1rem;">
                Aucune activité récente
            </div>
        `;
        return;
    }
    
    const activityHtml = appState.activity.map(activity => {
        let iconClass = '';
        let colorClass = '';
        
        switch (activity.type) {
            case 'sync':
                iconClass = '🔄';
                colorClass = 'color: var(--info)';
                break;
            case 'local':
                iconClass = '📝';
                colorClass = 'color: var(--text-primary)';
                break;
            case 'success':
                iconClass = '✅';
                colorClass = 'color: var(--success)';
                break;
            case 'error':
                iconClass = '❌';
                colorClass = 'color: var(--error)';
                break;
            case 'warning':
                iconClass = '⚠️';
                colorClass = 'color: var(--warning)';
                break;
            case 'connection':
                iconClass = '🔗';
                colorClass = 'color: var(--accent)';
                break;
            default:
                iconClass = 'ℹ️';
                colorClass = 'color: var(--text-secondary)';
        }
        
        return `
            <div class="activity-item" style="${colorClass}">
                <span class="activity-icon">${iconClass}</span>
                <span class="activity-message">${activity.message}</span>
                <span class="activity-time">${activity.timeStr}</span>
            </div>
        `;
    }).join('');
    
    activityLogEl.innerHTML = activityHtml;
}

function simulateProjectFiles() {
    // Simuler quelques fichiers pour la démo
    const demoFiles = [
        'index.html',
        'style.css',
        'script.js',
        'package.json',
        'README.md',
        'src/main.js',
        'src/utils.js',
        'assets/logo.png'
    ];
    
    demoFiles.forEach((file, index) => {
        setTimeout(() => {
            appState.projectFiles.set(file, {
                status: 'synced',
                lastModified: Date.now(),
                size: Math.floor(Math.random() * 10000)
            });
            updateFileList();
        }, index * 100);
    });
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Supprimer après 4 secondes
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

// Gestion des raccourcis clavier
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 'o':
                e.preventDefault();
                selectProject();
                break;
            case 's':
                e.preventDefault();
                if (!appState.isConnected && !appState.isHost) {
                    startHost();
                }
                break;
            case 'k':
                e.preventDefault();
                if (!appState.isConnected && !appState.isHost) {
                    showConnect();
                }
                break;
        }
    }
    
    if (e.key === 'Escape') {
        hideConnect();
    }
});

// **SYSTÈME DE MISE À JOUR**
async function checkForUpdates() {
    const checkBtn = document.getElementById('checkUpdateBtn');
    const updateInfo = document.getElementById('updateInfo');
    
    checkBtn.disabled = true;
    checkBtn.textContent = '🔍 Vérification...';
    updateInfo.textContent = 'Vérification des mises à jour...';
    
    try {
        const result = await ipcRenderer.invoke('check-for-updates');
        if (result.success) {
            updateInfo.textContent = 'Vérification terminée';
            showNotification('Vérification des mises à jour terminée', 'success');
        } else {
            updateInfo.textContent = 'Erreur lors de la vérification';
            showNotification(`Erreur: ${result.error}`, 'error');
        }
    } catch (error) {
        updateInfo.textContent = 'Erreur de connexion';
        showNotification('Impossible de vérifier les mises à jour', 'error');
    }
    
    checkBtn.disabled = false;
    checkBtn.textContent = '🔍 Vérifier';
}

async function downloadUpdate() {
    const downloadBtn = document.getElementById('downloadBtn');
    const updateProgress = document.getElementById('updateProgress');
    
    downloadBtn.disabled = true;
    downloadBtn.textContent = '📥 Téléchargement...';
    updateProgress.style.display = 'block';
    
    try {
        const result = await ipcRenderer.invoke('download-update');
        if (result.success) {
            showNotification('Téléchargement de la mise à jour commencé', 'info');
        } else {
            showNotification(`Erreur: ${result.error}`, 'error');
            updateProgress.style.display = 'none';
        }
    } catch (error) {
        showNotification('Erreur lors du téléchargement', 'error');
        updateProgress.style.display = 'none';
    }
    
    downloadBtn.disabled = false;
    downloadBtn.textContent = '📥 Télécharger';
}

async function installUpdate() {
    const installBtn = document.getElementById('installBtn');
    
    // Demander confirmation
    if (!confirm('L\'application va redémarrer pour installer la mise à jour. Continuer ?')) {
        return;
    }
    
    installBtn.disabled = true;
    installBtn.textContent = '🚀 Installation...';
    
    try {
        await ipcRenderer.invoke('install-update');
        showNotification('Installation de la mise à jour...', 'success');
    } catch (error) {
        showNotification('Erreur lors de l\'installation', 'error');
        installBtn.disabled = false;
        installBtn.textContent = '🚀 Installer';
    }
}

// Gestionnaires d'événements de mise à jour
function setupUpdateEventListeners() {
    // Vérification en cours
    addEventListeners('update-checking', () => {
        document.getElementById('updateInfo').textContent = 'Vérification en cours...';
        addActivity('🔍 Vérification des mises à jour...', 'info');
    });
    
    // Mise à jour disponible
    addEventListeners('update-available', (event, info) => {
        const updateInfo = document.getElementById('updateInfo');
        const downloadBtn = document.getElementById('downloadBtn');
        
        updateInfo.innerHTML = `
            <strong>Nouvelle version ${info.version} disponible!</strong><br>
            <small style="color: var(--text-secondary);">
                ${info.releaseNotes ? info.releaseNotes.substring(0, 100) + '...' : 'Nouvelle fonctionnalités et corrections'}
            </small>
        `;
        downloadBtn.style.display = 'inline-block';
        
        addActivity(`✨ Mise à jour ${info.version} disponible`, 'success');
        showNotification(`Nouvelle version ${info.version} disponible!`, 'success');
    });
    
    // Pas de mise à jour
    addEventListeners('update-not-available', () => {
        document.getElementById('updateInfo').textContent = '✅ Application à jour';
        addActivity('✅ Application déjà à jour', 'success');
    });
    
    // Erreur de mise à jour
    addEventListeners('update-error', (event, error) => {
        document.getElementById('updateInfo').textContent = `❌ Erreur: ${error.error}`;
        document.getElementById('updateProgress').style.display = 'none';
        addActivity(`❌ Erreur mise à jour: ${error.error}`, 'error');
    });
    
    // Progression du téléchargement
    addEventListeners('update-download-progress', (event, progress) => {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const updateInfo = document.getElementById('updateInfo');
        
        progressFill.style.width = `${progress.percent}%`;
        progressText.textContent = `${progress.percent}% - ${formatBytes(progress.transferred)}/${formatBytes(progress.total)}`;
        updateInfo.textContent = `📥 Téléchargement en cours... ${progress.percent}%`;
    });
    
    // Téléchargement terminé
    addEventListeners('update-downloaded', (event, info) => {
        const updateInfo = document.getElementById('updateInfo');
        const updateProgress = document.getElementById('updateProgress');
        const installBtn = document.getElementById('installBtn');
        const downloadBtn = document.getElementById('downloadBtn');
        
        updateInfo.innerHTML = `
            <strong>✅ Mise à jour ${info.version} téléchargée!</strong><br>
            <small style="color: var(--text-secondary);">Prête à être installée</small>
        `;
        updateProgress.style.display = 'none';
        downloadBtn.style.display = 'none';
        installBtn.style.display = 'inline-block';
        
        addActivity(`✅ Mise à jour ${info.version} téléchargée`, 'success');
        showNotification('Mise à jour téléchargée, prête à installer!', 'success');
    });
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Vérification automatique au démarrage (après 10 secondes)
setTimeout(() => {
    checkForUpdates();
}, 10000);

console.log('🎯 CodeSync renderer initialisé - Prêt pour la synchronisation!'); 