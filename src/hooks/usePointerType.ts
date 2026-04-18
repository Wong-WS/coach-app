'use client';

import { useEffect, useState } from 'react';

export type PointerType = 'fine' | 'coarse';

/**
 * Returns 'coarse' when the primary pointer is touch (phones, tablets),
 * 'fine' otherwise (mice, trackpads). Updates live if the user rotates
 * the device or plugs in a mouse.
 */
export function usePointerType(): PointerType {
  const [pointer, setPointer] = useState<PointerType>('fine');

  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)');
    const update = () => setPointer(mql.matches ? 'coarse' : 'fine');
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return pointer;
}
