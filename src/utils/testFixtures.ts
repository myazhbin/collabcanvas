import type { Shape } from './types.ts'

export const shape = (id: string, over: Partial<Shape> = {}): Shape => ({
  id,
  x: 10,
  y: 20,
  w: 120,
  h: 80,
  fill: '#2563eb',
  createdBy: 'alice',
  updatedAt: 1000,
  updatedBy: 'alice',
  draggedBy: null,
  ...over,
})
