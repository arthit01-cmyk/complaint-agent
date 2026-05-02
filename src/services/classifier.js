const { getCategories, getCategoryByKey } = require('./master');

function normalizeCategory(category) {
  if (!category || typeof category !== 'string') {
    return null;
  }

  const normalized = category.trim().toLowerCase();
  const categories = getCategories();

  const exact = categories.find(item => item.key === normalized || item.name.toLowerCase() === normalized);
  if (exact) {
    return exact.key;
  }

  const categoryByKeyword = categories.find(item => {
    const allKeywords = [
      ...(item.keywords || []),
      ...(item.urgentKeywords || []),
      item.name ? item.name.toLowerCase() : ''
    ];
    return allKeywords.some(keyword => keyword === normalized);
  });

  if (categoryByKeyword) {
    return categoryByKeyword.key;
  }

  return null;
}

function classifyUrgency(categoryKey, description = '') {
  const normalizedDescription = String(description).toLowerCase();
  const category = getCategoryByKey(categoryKey);
  if (!category) {
    return 'FYI';
  }

  const urgentKeywords = category.urgentKeywords || [];
  if (urgentKeywords.some(keyword => normalizedDescription.includes(keyword))) {
    return 'urgent';
  }

  return category.defaultUrgency || 'routine';
}

function mapDepartment(categoryKey) {
  const category = getCategoryByKey(categoryKey);
  return category ? category.department : 'General';
}

module.exports = {
  normalizeCategory,
  classifyUrgency,
  mapDepartment
};
