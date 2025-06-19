# 🌐 Guide Réseau syncTEAM

## 🔧 Résolution des problèmes de connexion

### ✅ **Étapes de diagnostic**

1. **Vérifier l'application**
   ```bash
   npm start
   # L'app doit afficher le bouton "🔒 Mode Local"
   ```

2. **Basculer en mode réseau**
   - Cliquer sur le bouton "🔒 Mode Local"
   - Il doit devenir "🌐 Mode Réseau" (orange)
   - Message : "Mode réseau activé - Port 8080 requis"

3. **Vérifier le port en écoute**
   ```bash
   netstat -an | findstr 8080
   # Doit afficher: TCP 0.0.0.0:8080 LISTENING
   ```

### 🔥 **Configuration Firewall Windows**

```powershell
# Ouvrir le port 8080 (en tant qu'administrateur)
netsh advfirewall firewall add rule name="syncTEAM-8080" dir=in action=allow protocol=TCP localport=8080

# Vérifier la règle
netsh advfirewall firewall show rule name="syncTEAM-8080"

# Si besoin, supprimer et recréer
netsh advfirewall firewall delete rule name="syncTEAM-8080"
```

### 🌍 **Test de connectivité**

**Depuis votre machine :**
```bash
# Test local
telnet localhost 8080

# Test réseau
telnet 192.168.1.155 8080
```

**Depuis une autre machine :**
```bash
telnet 192.168.1.155 8080
```

### 📋 **Checklist de dépannage**

- [ ] Application lancée (`npm start`)
- [ ] Mode réseau activé (bouton orange)
- [ ] Port 8080 en écoute (`netstat`)
- [ ] Règle firewall créée
- [ ] Test connexion local réussi
- [ ] Test connexion réseau réussi

### 🚨 **Problèmes courants**

**1. Bouton de basculement invisible**
- Redémarrer l'application
- Vérifier la console pour les erreurs

**2. Port 8080 occupé**
```bash
# Trouver le processus
netstat -ano | findstr 8080
# Arrêter le processus (remplacer PID)
taskkill /F /PID <PID>
```

**3. Connexion refusée**
- Vérifier que le mode réseau est activé
- Vérifier la règle firewall
- Tester avec un autre port

**4. Timeout de connexion**
- Vérifier l'antivirus (peut bloquer)
- Vérifier le routeur (port forwarding si nécessaire)

### 📞 **Informations de connexion**

**Votre IP locale :** `192.168.1.155`
**Port :** `8080`
**URL complète :** `ws://192.168.1.155:8080`

### 🎯 **Mode d'emploi rapide**

1. **Solo** → Gardez "🔒 Mode Local"
2. **Collaboration** → Passez en "🌐 Mode Réseau"
3. **Partagez** → `192.168.1.155:8080` + mot de passe de session
4. **Retour solo** → Recliquez pour revenir en mode local

---

💡 **Astuce :** Le mode se sauvegarde automatiquement. L'application se souvient de votre préférence au prochain démarrage. 