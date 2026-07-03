export function storagePortIndexes(portsPerServer: number) {
  const count = Math.max(0, Math.min(4, Math.trunc(portsPerServer)));
  return Array.from({ length: count }, (_, index) => index + 1);
}

export function visibleStorageServerLabels(prefix: string, count: number) {
  if (count <= 0) {
    return [];
  }

  if (count === 1) {
    return [`${prefix}1`];
  }

  if (count === 2) {
    return [`${prefix}1`, `${prefix}2`];
  }

  return [`${prefix}1`, `${prefix}2`, `${prefix}${count}`];
}

export function storageServerLeafTargetIndexes(serverPosition: number, portsPerServer: number, leafCount: number) {
  const portCount = Math.max(0, Math.trunc(portsPerServer));
  const targetCount = Math.max(0, Math.trunc(leafCount));

  if (portCount === 0 || targetCount === 0) {
    return [];
  }

  return Array.from({ length: portCount }, (_, portIndex) => (serverPosition * portCount + portIndex) % targetCount);
}

export function storageLeafSpineTargetIndexes(leafPosition: number, spineCount: number) {
  const targetCount = Math.max(0, Math.trunc(spineCount));

  if (targetCount === 0) {
    return [];
  }

  return Array.from({ length: targetCount }, (_, index) => index);
}
