// Système de résolution intelligente des conflits
let diffLines, diffChars;
try {
  const diff = require('diff');
  diffLines = diff.diffLines;
  diffChars = diff.diffChars;
} catch (error) {
  console.warn('Package diff non disponible, utilisation de fallbacks');
  // Fallbacks simples
  diffLines = (text1, text2) => {
    const lines1 = text1.split('\n');
    const lines2 = text2.split('\n');
    const result = [];
    
    for (let i = 0; i < Math.max(lines1.length, lines2.length); i++) {
      if (lines1[i] !== lines2[i]) {
        if (lines1[i]) result.push({ removed: true, value: lines1[i] });
        if (lines2[i]) result.push({ added: true, value: lines2[i] });
      } else {
        result.push({ value: lines1[i] || lines2[i] });
      }
    }
    return result;
  };
  
  diffChars = (text1, text2) => {
    if (text1 === text2) return [{ value: text1 }];
    return [
      { removed: true, value: text1 },
      { added: true, value: text2 }
    ];
  };
}

class ConflictResolver {
  constructor() {
    this.mergingStrategies = {
      'auto': this.autoMerge.bind(this),
      'manual': this.manualMerge.bind(this),
      'line-based': this.lineBasedMerge.bind(this),
      'semantic': this.semanticMerge.bind(this)
    };
    
    this.conflictHistory = [];
    this.resolutionStats = {
      autoResolved: 0,
      manualResolved: 0,
      failed: 0
    };
  }

  // Résolution automatique des conflits
  async resolveConflict(baseContent, localChanges, remoteChanges, strategy = 'auto') {
    console.log(`🔄 Résolution de conflit (stratégie: ${strategy})`);
    
    const conflict = {
      id: `conflict_${Date.now()}`,
      timestamp: Date.now(),
      base: baseContent,
      local: localChanges,
      remote: remoteChanges,
      strategy: strategy
    };
    
    try {
      const resolution = await this.mergingStrategies[strategy](conflict);
      
      if (resolution.success) {
        this.resolutionStats.autoResolved++;
        console.log(`✅ Conflit résolu automatiquement`);
      } else {
        this.resolutionStats.failed++;
        console.log(`❌ Échec résolution automatique`);
      }
      
      this.conflictHistory.push({
        ...conflict,
        resolution: resolution,
        resolvedAt: Date.now()
      });
      
      return resolution;
      
    } catch (error) {
      console.error('Erreur résolution conflit:', error);
      this.resolutionStats.failed++;
      
      return {
        success: false,
        error: error.message,
        conflictMarkers: this.createConflictMarkers(conflict)
      };
    }
  }

  // Stratégie de merge automatique
  async autoMerge(conflict) {
    const { base, local, remote } = conflict;
    
    // Vérifier si les changements sont compatibles
    if (this.areChangesCompatible(base, local, remote)) {
      return this.performThreeWayMerge(base, local, remote);
    }
    
    // Essayer différentes stratégies
    const strategies = ['line-based', 'semantic'];
    
    for (const strategy of strategies) {
      const result = await this.mergingStrategies[strategy](conflict);
      if (result.success) {
        return result;
      }
    }
    
    // Si aucune stratégie ne fonctionne, créer des marqueurs de conflit
    return {
      success: false,
      requiresManualResolution: true,
      conflictMarkers: this.createConflictMarkers(conflict)
    };
  }

  // Merge basé sur les lignes
  async lineBasedMerge(conflict) {
    const { base, local, remote } = conflict;
    
    const localDiff = diffLines(base, local);
    const remoteDiff = diffLines(base, remote);
    
    const mergedLines = [];
    const baseLines = base.split('\n');
    let localIndex = 0;
    let remoteIndex = 0;
    let baseIndex = 0;
    
    while (baseIndex < baseLines.length) {
      const baseLine = baseLines[baseIndex];
      
      // Vérifier les changements locaux
      const localChange = this.findChangeAtLine(localDiff, baseIndex);
      const remoteChange = this.findChangeAtLine(remoteDiff, baseIndex);
      
      if (!localChange && !remoteChange) {
        // Pas de changement
        mergedLines.push(baseLine);
        baseIndex++;
      } else if (localChange && !remoteChange) {
        // Changement local seulement
        mergedLines.push(...this.applyLineChange(localChange));
        baseIndex += localChange.count || 1;
      } else if (!localChange && remoteChange) {
        // Changement remote seulement
        mergedLines.push(...this.applyLineChange(remoteChange));
        baseIndex += remoteChange.count || 1;
      } else {
        // Conflit sur la même ligne
        if (this.canAutoResolveLineConflict(localChange, remoteChange)) {
          const resolved = this.resolveLineConflict(localChange, remoteChange);
          mergedLines.push(...resolved);
          baseIndex += Math.max(localChange.count || 1, remoteChange.count || 1);
        } else {
          // Créer un marqueur de conflit
          mergedLines.push(
            '<<<<<<< LOCAL',
            ...this.applyLineChange(localChange),
            '=======',
            ...this.applyLineChange(remoteChange),
            '>>>>>>> REMOTE'
          );
          return {
            success: false,
            requiresManualResolution: true,
            partialMerge: mergedLines.join('\n')
          };
        }
      }
    }
    
    return {
      success: true,
      mergedContent: mergedLines.join('\n'),
      method: 'line-based'
    };
  }

  // Merge sémantique (pour le code)
  async semanticMerge(conflict) {
    const { base, local, remote } = conflict;
    
    try {
      // Analyser la structure du code
      const baseAST = this.parseCode(base);
      const localAST = this.parseCode(local);
      const remoteAST = this.parseCode(remote);
      
      if (!baseAST || !localAST || !remoteAST) {
        // Fallback vers line-based si le parsing échoue
        return this.lineBasedMerge(conflict);
      }
      
      // Identifier les changements sémantiques
      const localChanges = this.identifySemanticChanges(baseAST, localAST);
      const remoteChanges = this.identifySemanticChanges(baseAST, remoteAST);
      
      // Vérifier les conflits sémantiques
      const semanticConflicts = this.findSemanticConflicts(localChanges, remoteChanges);
      
      if (semanticConflicts.length === 0) {
        // Pas de conflit sémantique, merger
        const mergedAST = this.mergeASTs(baseAST, localChanges, remoteChanges);
        const mergedContent = this.generateCode(mergedAST);
        
        return {
          success: true,
          mergedContent: mergedContent,
          method: 'semantic'
        };
      } else {
        // Conflits sémantiques détectés
        return {
          success: false,
          requiresManualResolution: true,
          semanticConflicts: semanticConflicts,
          suggestions: this.generateResolutionSuggestions(semanticConflicts)
        };
      }
      
    } catch (error) {
      console.error('Erreur merge sémantique:', error);
      return this.lineBasedMerge(conflict);
    }
  }

  // Three-way merge avancé
  performThreeWayMerge(base, local, remote) {
    // Implémentation simplifiée du three-way merge
    try {
      // Si local et remote sont identiques, pas de conflit
      if (local === remote) {
        return {
          success: true,
          mergedContent: local,
          method: 'three-way-identical'
        };
      }
      
      // Si l'un des deux est identique à la base, prendre l'autre
      if (local === base) {
        return {
          success: true,
          mergedContent: remote,
          method: 'three-way-remote'
        };
      }
      
      if (remote === base) {
        return {
          success: true,
          mergedContent: local,
          method: 'three-way-local'
        };
      }
      
      // Sinon, essayer un merge ligne par ligne
      const baseLines = base.split('\n');
      const localLines = local.split('\n');
      const remoteLines = remote.split('\n');
      
      const mergedLines = [];
      const maxLines = Math.max(baseLines.length, localLines.length, remoteLines.length);
      
      for (let i = 0; i < maxLines; i++) {
        const baseLine = baseLines[i] || '';
        const localLine = localLines[i] || '';
        const remoteLine = remoteLines[i] || '';
        
        if (localLine === remoteLine) {
          // Même changement des deux côtés
          mergedLines.push(localLine);
        } else if (localLine === baseLine) {
          // Changement seulement côté remote
          mergedLines.push(remoteLine);
        } else if (remoteLine === baseLine) {
          // Changement seulement côté local
          mergedLines.push(localLine);
        } else {
          // Conflit - créer des marqueurs
          return {
            success: false,
            requiresManualResolution: true,
            conflictMarkers: this.createConflictMarkers({
              local: local,
              remote: remote
            })
          };
        }
      }
      
      return {
        success: true,
        mergedContent: mergedLines.join('\n'),
        method: 'three-way-merged'
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        method: 'three-way-failed'
      };
    }
  }

  // Vérifier si les changements sont compatibles
  areChangesCompatible(base, local, remote) {
    // Calcul simple basé sur les positions des changements
    const localChanges = this.extractChangePositions(base, local);
    const remoteChanges = this.extractChangePositions(base, remote);
    
    // Vérifier les chevauchements
    for (const localChange of localChanges) {
      for (const remoteChange of remoteChanges) {
        if (this.changesOverlap(localChange, remoteChange)) {
          return false;
        }
      }
    }
    
    return true;
  }

  // Créer des marqueurs de conflit visuels
  createConflictMarkers(conflict) {
    const { local, remote } = conflict;
    
    return {
      start: '<<<<<<< LOCAL (Vos changements)',
      localContent: local,
      separator: '======= REMOTE (Changements distants)',
      remoteContent: remote,
      end: '>>>>>>> REMOTE',
      fullMarker: [
        '<<<<<<< LOCAL (Vos changements)',
        local,
        '======= REMOTE (Changements distants)', 
        remote,
        '>>>>>>> REMOTE'
      ].join('\n')
    };
  }

  // Parsing simple du code JavaScript
  parseCode(code) {
    try {
      // Utiliser Acorn ou Esprima en production
      // Ici, parsing simple pour la démo
      return {
        type: 'Program',
        body: this.extractFunctions(code),
        raw: code
      };
    } catch (error) {
      return null;
    }
  }

  extractFunctions(code) {
    const functions = [];
    const functionRegex = /function\s+(\w+)\s*\([^)]*\)\s*\{/g;
    let match;
    
    while ((match = functionRegex.exec(code)) !== null) {
      functions.push({
        type: 'FunctionDeclaration',
        name: match[1],
        start: match.index,
        end: this.findFunctionEnd(code, match.index)
      });
    }
    
    return functions;
  }

  findFunctionEnd(code, start) {
    let braceCount = 0;
    let inString = false;
    let stringChar = '';
    
    for (let i = start; i < code.length; i++) {
      const char = code[i];
      
      if (inString) {
        if (char === stringChar && code[i-1] !== '\\') {
          inString = false;
        }
      } else {
        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
        } else if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return i + 1;
          }
        }
      }
    }
    
    return code.length;
  }

  // Obtenir les statistiques de résolution
  getResolutionStats() {
    const total = this.resolutionStats.autoResolved + 
                  this.resolutionStats.manualResolved + 
                  this.resolutionStats.failed;
    
    return {
      ...this.resolutionStats,
      total: total,
      successRate: total > 0 ? (this.resolutionStats.autoResolved / total * 100).toFixed(1) : 0,
      recentConflicts: this.conflictHistory.slice(-10)
    };
  }

  // Générer des suggestions de résolution
  generateResolutionSuggestions(conflicts) {
    return conflicts.map(conflict => ({
      type: conflict.type,
      description: this.getConflictDescription(conflict),
      suggestions: this.getConflictSuggestions(conflict),
      autoResolvable: this.isAutoResolvable(conflict)
    }));
  }

  getConflictDescription(conflict) {
    switch (conflict.type) {
      case 'function_modification':
        return `La fonction "${conflict.name}" a été modifiée différemment`;
      case 'variable_declaration':
        return `La variable "${conflict.name}" a des déclarations conflictuelles`;
      case 'import_statement':
        return `Imports conflictuels détectés`;
      default:
        return 'Conflit de code détecté';
    }
  }

  // Nettoyer l'historique des conflits
  cleanupHistory() {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    this.conflictHistory = this.conflictHistory.filter(
      conflict => conflict.timestamp > oneWeekAgo
    );
  }

  // Ajouter les méthodes manquantes
  findChangeAtLine(diff, lineIndex) {
    return diff.find(change => change.lineNumber === lineIndex);
  }

  applyLineChange(change) {
    if (change.added) {
      return change.value.split('\n');
    } else if (change.removed) {
      return [];
    }
    return [change.value];
  }

  canAutoResolveLineConflict(localChange, remoteChange) {
    // Simple heuristic - si les changements sont identiques
    return localChange.value === remoteChange.value;
  }

  resolveLineConflict(localChange, remoteChange) {
    return [localChange.value]; // Prendre le changement local par défaut
  }

  identifySemanticChanges(baseAST, changedAST) {
    return []; // Implémentation simplifiée
  }

  findSemanticConflicts(localChanges, remoteChanges) {
    return []; // Implémentation simplifiée
  }

  mergeASTs(baseAST, localChanges, remoteChanges) {
    return baseAST; // Implémentation simplifiée
  }

  generateCode(ast) {
    return ast.raw || ''; // Implémentation simplifiée
  }

  extractChangePositions(base, changed) {
    return []; // Implémentation simplifiée
  }

  changesOverlap(change1, change2) {
    return false; // Implémentation simplifiée
  }

  analyzeConflictType(local, remote) {
    if (local.includes('import') && remote.includes('import')) {
      return 'import_order';
    }
    if (local.trim() !== remote.trim() && local.replace(/\s+/g, ' ') === remote.replace(/\s+/g, ' ')) {
      return 'formatting';
    }
    return 'content_conflict';
  }

  reinforcePattern(suggestionType, context) {
    // Implémentation simplifiée pour l'apprentissage
  }

  weakenPattern(suggestionType, context) {
    // Implémentation simplifiée pour l'apprentissage
  }

  isAutoResolvable(conflict) {
    return conflict.type === 'formatting' || conflict.type === 'import_order';
  }

  getConflictSuggestions(conflict) {
    return [`Résoudre le conflit ${conflict.type}`];
  }

  generateRecommendations(analysis) {
    return [`Améliorer la qualité du code à ${analysis.metrics.codeQuality}%`];
  }

  // Stratégie de merge manuel
  async manualMerge(conflict) {
    // Pour le merge manuel, on retourne le conflit avec des marqueurs
    return {
      success: false,
      requiresManualResolution: true,
      conflictMarkers: this.createConflictMarkers(conflict),
      method: 'manual'
    };
  }
}

module.exports = ConflictResolver; 