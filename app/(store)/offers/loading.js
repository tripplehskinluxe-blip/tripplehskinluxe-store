import { PageHeadSkeleton, GridSkeleton } from '@/components/Skeletons';

export default function Loading() {
  return (
    <div role="status" aria-label="Loading offers">
      <PageHeadSkeleton crumb={false} />
      <div className="container" style={{ padding: '36px 20px 80px' }}><GridSkeleton n={8} /></div>
    </div>
  );
}
