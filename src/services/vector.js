const fs = require('fs');
const path = require('path');

const vectorFile = path.resolve(__dirname, '../data/vector_index.json');

// Simple TF-IDF Vectorizer
class SimpleVectorDB {
  constructor() {
    this.documents = []; // { id, text, metadata, vector }
    this.idf = {};
    this.terms = [];
    this.load();
  }

  load() {
    if (fs.existsSync(vectorFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(vectorFile, 'utf8'));
        this.documents = data.documents || [];
        this.idf = data.idf || {};
        this.terms = data.terms || [];
      } catch (err) {
        this.documents = [];
      }
    }
  }

  save() {
    const data = {
      documents: this.documents,
      idf: this.idf,
      terms: this.terms
    };
    fs.mkdirSync(path.dirname(vectorFile), { recursive: true });
    fs.writeFileSync(vectorFile, JSON.stringify(data, null, 2), 'utf8');
  }

  tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  // Update IDF and all vectors
  rebuildIndex() {
    const allTokens = this.documents.map(d => [...new Set(this.tokenize(d.text))]);
    const docCount = this.documents.length;
    
    this.terms = [...new Set(allTokens.flat())];
    this.idf = {};
    
    this.terms.forEach(term => {
      const count = allTokens.filter(tokens => tokens.includes(term)).length;
      this.idf[term] = Math.log(docCount / (1 + count));
    });

    this.documents.forEach(doc => {
      doc.vector = this.getVector(doc.text);
    });
    this.save();
  }

  getVector(text) {
    const tokens = this.tokenize(text);
    const tf = {};
    tokens.forEach(t => tf[t] = (tf[t] || 0) + 1);
    
    const vector = {};
    this.terms.forEach(term => {
      if (tf[term]) {
        vector[term] = tf[term] * (this.idf[term] || 0);
      }
    });
    return vector;
  }

  cosineSimilarity(v1, v2) {
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;
    
    const keys = new Set([...Object.keys(v1), ...Object.keys(v2)]);
    keys.forEach(key => {
      const val1 = v1[key] || 0;
      const val2 = v2[key] || 0;
      dotProduct += val1 * val2;
      mag1 += val1 * val1;
      mag2 += val2 * val2;
    });
    
    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);
    
    if (mag1 === 0 || mag2 === 0) return 0;
    return dotProduct / (mag1 * mag2);
  }

  upsert(id, text, metadata = {}) {
    const index = this.documents.findIndex(d => d.id === id);
    if (index !== -1) {
      this.documents[index] = { id, text, metadata };
    } else {
      this.documents.push({ id, text, metadata });
    }
    // For simplicity, we rebuild index on every change for small datasets
    // In production, we'd do this incrementally or periodically
    this.rebuildIndex();
  }

  search(query, limit = 5) {
    const queryVector = this.getVector(query);
    const results = this.documents.map(doc => ({
      ...doc,
      score: this.cosineSimilarity(queryVector, doc.vector || {})
    }));
    
    return results
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

const db = new SimpleVectorDB();

module.exports = {
  upsertTask: (task) => {
    const text = `${task.title} ${task.description} ${task.departmentLabel} ${task.status} ${task.assignedToLabels ? task.assignedToLabels.join(' ') : ''}`;
    db.upsert(task.id, text, { type: 'task', id: task.id });
  },
  search: (query, limit) => db.search(query, limit),
  reindexAll: (tasks) => {
    db.documents = [];
    tasks.forEach(task => {
      const text = `${task.title} ${task.description} ${task.departmentLabel} ${task.status} ${task.assignedToLabels ? task.assignedToLabels.join(' ') : ''}`;
      db.documents.push({ id: task.id, text, metadata: { type: 'task', id: task.id } });
    });
    db.rebuildIndex();
  }
};
