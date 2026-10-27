import { PageHeadSkeleton, Sk } from '@/components/Skeletons';

export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <PageHeadSkeleton />
      <div className="container" style={{ padding: '36px 20px 80px', display: 'grid', gap: 14, maxWidth: 820 }}>
        <Sk h={14} w="92%" /><Sk h={14} w="86%" /><Sk h={14} w="90%" /><Sk h={14} w="64%" />
      </div>
    </div>
  );
}
