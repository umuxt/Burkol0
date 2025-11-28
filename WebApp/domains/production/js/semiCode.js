// Semi-finished product code generation - Prefix utilities
// 
// Prefix is auto-generated from station's operations (e.g., "Be-", "BeCu-")
// Used for manual output code entry in Plan Designer

export function getPrefixForNode(node, ops = [], stations = []) {
  // Prefer station-based combined operation codes (e.g., KAs) if station is selected
  // ✅ Get first assigned station from assignedStations array (priority-aware)
  let firstStationId = null;
  
  if (Array.isArray(node.assignedStations) && node.assignedStations.length > 0) {
    // ✅ Sort by priority (lowest number = highest priority)
    const sortedStations = [...node.assignedStations].sort((a, b) => 
      (a.priority || 999) - (b.priority || 999)
    );
    
    const firstStation = sortedStations[0];
    firstStationId = firstStation.stationId || firstStation.id;
    
    console.log(`📝 Output code prefix for ${node.operationName || node.name || 'node'}: Using station ${firstStationId} (priority: ${firstStation.priority || 'N/A'})`);
  } else if (node.stationId) {
    // ✅ Backward compatibility: single stationId field
    firstStationId = node.stationId;
  }
  
  const station = firstStationId && Array.isArray(stations)
    ? stations.find(s => s.id === firstStationId)
    : null;
    
  if (station && Array.isArray(station.operations)) {
    const opMap = new Map((Array.isArray(ops) ? ops : []).map(o => [o.id, o]));
    const codes = station.operations
      .map(id => opMap.get(id)?.semiOutputCode)
      .filter(code => code && String(code).trim() !== '')
      .map(code => String(code).trim())
      .sort(); // Alphabetically sorted
      
    if (codes.length) {
      // Remove duplicates while preserving sort
      const uniq = Array.from(new Set(codes));
      return uniq.join('') + '-'; // Return with dash (e.g., "BeCu-")
    }
  }
  
  // Fallback to the node's operation code if available
  const op = Array.isArray(ops) ? ops.find(o => o.id === node.operationId) : null;
  const code = (op && op.semiOutputCode) ? String(op.semiOutputCode).trim() : '';
  if (code) return code + '-';
  
  // Last resort: infer from node name/type
  if (node.name && node.name.length) return node.name[0].toUpperCase() + '-';
  if (node.type && node.type.length) return node.type[0].toUpperCase() + '-';
  
  return 'S-';
}
