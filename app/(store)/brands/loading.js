import { PageHeadSkeleton, Sk } from '@/components/Skeletons';

export default function Loading() {
  return (
    <div role="status" aria-label="Loading brands">
      <PageHeadSkeleton crumb={false} />
      <div className="container" style={{ padding: '36px 20px 80px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 16 }}>
        {Array.from({ length: 18 }, (_, i) => <Sk key={i} h={18} w={`${60 + ((i * 7) % 35)}%`} />)}
      </div>
    </div>
  );
}
