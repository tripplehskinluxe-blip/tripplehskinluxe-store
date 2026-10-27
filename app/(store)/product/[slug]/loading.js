import { Sk } from '@/components/Skeletons';

export default function Loading() {
  return (
    <div className="container" role="status" aria-label="Loading product" style={{ padding: '28px 20px 80px' }}>
      <Sk w={200} h={12} />
      <div className="sk-pd">
        <div>
          <div className="media sk" />
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>{[0, 1, 2, 3].map((i) => <Sk key={i} w={72} h={72} r={12} />)}</div>
        </div>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <Sk w={90} h={12} /><Sk w="80%" h={34} r={10} /><Sk w={150} h={14} /><Sk w={130} h={28} />
          <Sk h={12} /><Sk h={12} w="94%" /><Sk h={12} w="70%" />
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}><Sk h={50} r={999} style={{ flex: 1 }} /><Sk w={50} h={50} r="50%" /></div>
        </div>
      </div>
    </div>
  );
}
