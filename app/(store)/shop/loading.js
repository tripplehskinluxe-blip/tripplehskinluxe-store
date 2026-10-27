import { PageHeadSkeleton, GridSkeleton, Sk } from '@/components/Skeletons';

export default function Loading() {
  return (
    <div role="status" aria-label="Loading products">
      <PageHeadSkeleton />
      <div className="container">
        <div className="shop">
          <aside className="sk-side">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ display: 'grid', gap: 10 }}><Sk w="55%" h={14} /><Sk h={12} /><Sk h={12} w="80%" /><Sk h={12} w="65%" /></div>
            ))}
          </aside>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}><Sk w={120} h={14} /><Sk w={150} h={36} r={999} /></div>
            <GridSkeleton n={9} />
          </div>
        </div>
      </div>
    </div>
  );
}
