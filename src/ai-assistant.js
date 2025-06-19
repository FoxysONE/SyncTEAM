// Assistant IA pour le live coding
const { EventEmitter } = require('events');

class AICodeAssistant extends EventEmitter {
  constructor() {
    super(); // Appeler le constructeur d'EventEmitter
    
    this.suggestions = new Map();
    this.codeAnalysis = new Map();
    this.patterns = new Map();
    this.userPreferences = {};
    
    // Patterns de code courants
    this.initializePatterns();
    
    // Historique d'assistance
    this.assistanceHistory = [];
  }

  // Analyser le code en temps réel
  analyzeCode(fileName, content, cursorPosition = 0) {
    const analysis = {
      fileName: fileName,
      timestamp: Date.now(),
      issues: [],
      suggestions: [],
      insights: [],
      metrics: {}
    };

    try {
      // Détection d'erreurs syntaxiques
      const syntaxIssues = this.detectSyntaxIssues(content);
      analysis.issues.push(...syntaxIssues);

      // Suggestions d'amélioration
      const improvements = this.suggestImprovements(content, cursorPosition);
      analysis.suggestions.push(...improvements);

      // Auto-complétion intelligente
      const completions = this.generateCompletions(content, cursorPosition);
      analysis.completions = completions;

      // Métriques de qualité du code
      analysis.metrics = this.calculateCodeMetrics(content);

      // Détection de patterns
      const detectedPatterns = this.detectPatterns(content);
      analysis.patterns = detectedPatterns;

      this.codeAnalysis.set(fileName, analysis);
      
      // Émettre un événement avec l'analyse
      this.emit('analysis_complete', {
        fileName: fileName,
        analysis: analysis
      });
      
      // Émettre des suggestions si disponibles
      if (analysis.suggestions.length > 0) {
        this.emit('suggestion', {
          fileName: fileName,
          suggestions: analysis.suggestions
        });
      }
      
      return analysis;

    } catch (error) {
      console.error('Erreur analyse IA:', error);
      return analysis;
    }
  }

  // Détection d'erreurs syntaxiques
  detectSyntaxIssues(content) {
    const issues = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Parenthèses non fermées
      if (this.hasUnmatchedParentheses(line)) {
        issues.push({
          type: 'syntax_error',
          severity: 'error',
          line: index + 1,
          message: 'Parenthèses non équilibrées',
          suggestion: 'Vérifiez les parenthèses ouvrantes et fermantes'
        });
      }

      // Variables non déclarées (détection simple)
      const undeclaredVars = this.findUndeclaredVariables(line, index, lines);
      issues.push(...undeclaredVars);

      // Fonctions non définies
      const undefinedFunctions = this.findUndefinedFunctions(line);
      issues.push(...undefinedFunctions);
    });

    return issues;
  }

  // Suggestions d'amélioration du code
  suggestImprovements(content, cursorPosition) {
    const suggestions = [];
    const context = this.getCodeContext(content, cursorPosition);

    // Refactoring suggestions
    if (this.detectCodeDuplication(content)) {
      suggestions.push({
        type: 'refactoring',
        title: 'Code dupliqué détecté',
        description: 'Extraire le code commun dans une fonction',
        action: 'extract_function',
        priority: 'medium'
      });
    }

    // Performance suggestions
    const performanceIssues = this.detectPerformanceIssues(content);
    suggestions.push(...performanceIssues);

    // Style suggestions
    const styleIssues = this.detectStyleIssues(content);
    suggestions.push(...styleIssues);

    // Suggestions contextuelles
    const contextualSuggestions = this.getContextualSuggestions(context);
    suggestions.push(...contextualSuggestions);

    return suggestions;
  }

  // Auto-complétion intelligente
  generateCompletions(content, cursorPosition) {
    const context = this.getCodeContext(content, cursorPosition);
    const completions = [];

    // Complétion de variables
    const variables = this.extractVariables(content);
    variables.forEach(variable => {
      if (variable.name.startsWith(context.currentWord)) {
        completions.push({
          type: 'variable',
          text: variable.name,
          detail: variable.type || 'variable',
          score: this.calculateRelevanceScore(variable, context)
        });
      }
    });

    // Complétion de fonctions
    const functions = this.extractFunctions(content);
    functions.forEach(func => {
      if (func.name.startsWith(context.currentWord)) {
        completions.push({
          type: 'function',
          text: `${func.name}(${func.params.join(', ')})`,
          detail: func.signature,
          score: this.calculateRelevanceScore(func, context)
        });
      }
    });

    // Snippets contextuels
    const snippets = this.getContextualSnippets(context);
    completions.push(...snippets);

    // Trier par pertinence
    return completions.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  // Métriques de qualité du code
  calculateCodeMetrics(content) {
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);

    return {
      linesOfCode: nonEmptyLines.length,
      totalLines: lines.length,
      complexity: this.calculateComplexity(content),
      maintainabilityIndex: this.calculateMaintainability(content),
      testCoverage: this.estimateTestCoverage(content),
      duplicationRatio: this.calculateDuplication(content),
      commentRatio: this.calculateCommentRatio(content)
    };
  }

  // Détection de patterns de code
  detectPatterns(content) {
    const patterns = [];

    // Design patterns
    if (this.detectSingletonPattern(content)) {
      patterns.push({ type: 'singleton', confidence: 0.8 });
    }

    if (this.detectObserverPattern(content)) {
      patterns.push({ type: 'observer', confidence: 0.7 });
    }

    // Anti-patterns
    if (this.detectGodClass(content)) {
      patterns.push({ type: 'god_class', confidence: 0.6, warning: true });
    }

    if (this.detectLongParameterList(content)) {
      patterns.push({ type: 'long_parameter_list', confidence: 0.8, warning: true });
    }

    return patterns;
  }

  // Suggestions en temps réel pendant la frappe
  getRealtimeSuggestions(content, cursorPosition, lastChange) {
    const suggestions = [];
    const context = this.getCodeContext(content, cursorPosition);

    // Suggestions basées sur le dernier changement
    if (lastChange.type === 'insert') {
      const insertedText = lastChange.text;

      // Auto-completion de parenthèses
      if (insertedText === '(') {
        suggestions.push({
          type: 'auto_complete',
          text: ')',
          position: cursorPosition,
          description: 'Fermer la parenthèse'
        });
      }

      // Auto-completion de quotes
      if (insertedText === '"' || insertedText === "'") {
        suggestions.push({
          type: 'auto_complete',
          text: insertedText,
          position: cursorPosition,
          description: 'Fermer la quote'
        });
      }

      // Suggestions de méthodes
      if (insertedText === '.') {
        const objectSuggestions = this.getObjectMethodSuggestions(context);
        suggestions.push(...objectSuggestions);
      }
    }

    return suggestions;
  }

  // Assistant pour résolution de conflits
  suggestConflictResolution(conflict) {
    const { local, remote, base } = conflict;
    
    const analysis = {
      conflictType: this.analyzeConflictType(local, remote),
      suggestions: [],
      autoResolvable: false
    };

    // Analyse sémantique des conflits
    if (analysis.conflictType === 'formatting') {
      analysis.suggestions.push({
        type: 'formatting',
        description: 'Conflit de formatage détecté',
        action: 'apply_prettier',
        autoResolvable: true
      });
    }

    if (analysis.conflictType === 'import_order') {
      analysis.suggestions.push({
        type: 'import_optimization',
        description: 'Réorganiser les imports',
        action: 'sort_imports',
        autoResolvable: true
      });
    }

    return analysis;
  }

  // Apprentissage des préférences utilisateur
  learnFromUser(interaction) {
    const { type, accepted, suggestion, context } = interaction;
    
    if (accepted) {
      // Renforcer ce type de suggestion
      this.reinforcePattern(suggestion.type, context);
    } else {
      // Réduire la priorité de ce type de suggestion
      this.weakenPattern(suggestion.type, context);
    }
    
    this.assistanceHistory.push({
      timestamp: Date.now(),
      interaction: interaction
    });
  }

  // Méthodes utilitaires
  getCodeContext(content, cursorPosition) {
    const lines = content.split('\n');
    let currentLine = 0;
    let currentColumn = 0;
    let charCount = 0;

    // Trouver la ligne et colonne actuelles
    for (let i = 0; i < lines.length; i++) {
      if (charCount + lines[i].length >= cursorPosition) {
        currentLine = i;
        currentColumn = cursorPosition - charCount;
        break;
      }
      charCount += lines[i].length + 1; // +1 pour le \n
    }

    const currentLineContent = lines[currentLine] || '';
    const currentWord = this.extractCurrentWord(currentLineContent, currentColumn);

    return {
      line: currentLine,
      column: currentColumn,
      currentLineContent: currentLineContent,
      currentWord: currentWord,
      scope: this.determineScope(lines, currentLine),
      indentLevel: this.getIndentLevel(currentLineContent)
    };
  }

  extractCurrentWord(line, column) {
    const beforeCursor = line.substring(0, column);
    const afterCursor = line.substring(column);
    
    const wordBefore = beforeCursor.match(/\w+$/);
    const wordAfter = afterCursor.match(/^\w+/);
    
    return (wordBefore ? wordBefore[0] : '') + (wordAfter ? wordAfter[0] : '');
  }

  hasUnmatchedParentheses(line) {
    let count = 0;
    for (const char of line) {
      if (char === '(') count++;
      if (char === ')') count--;
      if (count < 0) return true;
    }
    return count !== 0;
  }

  initializePatterns() {
    // Patterns de code courants
    this.patterns.set('console_log', {
      regex: /console\.log\(/g,
      suggestion: 'Utiliser un logger plus robuste',
      severity: 'info'
    });

    this.patterns.set('var_declaration', {
      regex: /var\s+\w+/g,
      suggestion: 'Utiliser let ou const au lieu de var',
      severity: 'warning'
    });

    this.patterns.set('missing_semicolon', {
      regex: /\w+\s*$/gm,
      suggestion: 'Ajouter un point-virgule',
      severity: 'style'
    });
  }

  // Générer un rapport d'analyse
  generateAnalysisReport(fileName) {
    const analysis = this.codeAnalysis.get(fileName);
    if (!analysis) return null;

    return {
      fileName: fileName,
      timestamp: analysis.timestamp,
      summary: {
        totalIssues: analysis.issues.length,
        criticalIssues: analysis.issues.filter(i => i.severity === 'error').length,
        suggestions: analysis.suggestions.length,
        codeQuality: this.calculateOverallQuality(analysis.metrics)
      },
      details: analysis,
      recommendations: this.generateRecommendations(analysis)
    };
  }

  calculateOverallQuality(metrics) {
    // Algorithme simple de calcul de qualité
    let score = 100;
    
    if (metrics.complexity > 10) score -= 20;
    if (metrics.duplicationRatio > 0.1) score -= 15;
    if (metrics.commentRatio < 0.1) score -= 10;
    if (metrics.maintainabilityIndex < 50) score -= 25;
    
    return Math.max(0, score);
  }

  // Méthodes utilitaires manquantes
  findUndeclaredVariables(line, index, lines) {
    // Implémentation simplifiée
    return [];
  }

  findUndefinedFunctions(line) {
    // Implémentation simplifiée
    return [];
  }

  detectCodeDuplication(content) {
    // Implémentation simplifiée
    const lines = content.split('\n');
    const lineSet = new Set();
    let duplicates = 0;
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && lineSet.has(trimmed)) {
        duplicates++;
      }
      lineSet.add(trimmed);
    });
    
    return duplicates > 0;
  }

  detectPerformanceIssues(content) {
    const issues = [];
    
    // Détecter les boucles imbriquées
    if (content.includes('for') && content.match(/for.*for/s)) {
      issues.push({
        type: 'performance',
        title: 'Boucles imbriquées détectées',
        description: 'Considérer une optimisation',
        priority: 'medium'
      });
    }
    
    return issues;
  }

  detectStyleIssues(content) {
    const issues = [];
    
    // Détecter var au lieu de let/const
    if (content.includes('var ')) {
      issues.push({
        type: 'style',
        title: 'Utilisation de var',
        description: 'Utiliser let ou const à la place',
        priority: 'low'
      });
    }
    
    return issues;
  }

  getContextualSuggestions(context) {
    const suggestions = [];
    
    if (context.currentWord.startsWith('con')) {
      suggestions.push({
        type: 'keyword',
        title: 'console.log',
        description: 'Affichage de debug',
        priority: 'high'
      });
    }
    
    return suggestions;
  }

  extractVariables(content) {
    const variables = [];
    const regex = /(?:let|const|var)\s+(\w+)/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      variables.push({
        name: match[1],
        type: 'variable'
      });
    }
    
    return variables;
  }

  extractFunctions(content) {
    const functions = [];
    const regex = /function\s+(\w+)\s*\(([^)]*)\)/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      functions.push({
        name: match[1],
        params: match[2] ? match[2].split(',').map(p => p.trim()) : [],
        signature: match[0]
      });
    }
    
    return functions;
  }

  calculateRelevanceScore(item, context) {
    let score = 0;
    
    if (item.name.toLowerCase().includes(context.currentWord.toLowerCase())) {
      score += 10;
    }
    
    return score;
  }

  getContextualSnippets(context) {
    const snippets = [];
    
    if (context.currentWord === 'if') {
      snippets.push({
        type: 'snippet',
        text: 'if (condition) {\n  // code\n}',
        detail: 'if statement',
        score: 5
      });
    }
    
    return snippets;
  }

  calculateComplexity(content) {
    // Complexité cyclomatique simplifiée
    const keywords = ['if', 'else', 'for', 'while', 'switch', 'case'];
    let complexity = 1;
    
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = content.match(regex);
      if (matches) complexity += matches.length;
    });
    
    return complexity;
  }

  calculateMaintainability(content) {
    // Index de maintenabilité simplifié
    const lines = content.split('\n').length;
    const complexity = this.calculateComplexity(content);
    
    return Math.max(0, 100 - (complexity * 2) - (lines / 10));
  }

  estimateTestCoverage(content) {
    // Estimation basée sur la présence de tests
    if (content.includes('test(') || content.includes('describe(') || content.includes('it(')) {
      return 0.8;
    }
    return 0.1;
  }

  calculateDuplication(content) {
    // Ratio de duplication simplifié
    const lines = content.split('\n');
    const uniqueLines = new Set(lines.map(line => line.trim())).size;
    
    return Math.max(0, 1 - (uniqueLines / lines.length));
  }

  calculateCommentRatio(content) {
    const lines = content.split('\n');
    const commentLines = lines.filter(line => line.trim().startsWith('//') || line.trim().startsWith('/*')).length;
    
    return commentLines / lines.length;
  }

  detectSingletonPattern(content) {
    return content.includes('getInstance') && content.includes('constructor');
  }

  detectObserverPattern(content) {
    return content.includes('addEventListener') || content.includes('subscribe');
  }

  detectGodClass(content) {
    const methods = (content.match(/function\s+\w+/g) || []).length;
    return methods > 20;
  }

  detectLongParameterList(content) {
    const regex = /function\s+\w+\s*\([^)]{50,}\)/;
    return regex.test(content);
  }

  getObjectMethodSuggestions(context) {
    // Suggestions de méthodes d'objet
    return [
      {
        type: 'method',
        text: 'length',
        description: 'Longueur du tableau/string'
      }
    ];
  }

  determineScope(lines, currentLine) {
    // Déterminer le scope actuel
    return 'global';
  }

  getIndentLevel(line) {
    return (line.match(/^\s*/) || [''])[0].length;
  }
}

module.exports = AICodeAssistant; 