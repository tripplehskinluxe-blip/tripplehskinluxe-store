export function Sk({ w, h, r, mt, mb, className = '', style }) {
  return <span aria-hidden="true" className={`sk ${className}`.trim()} style={{ width: w, height: h, borderRadius: r, marginTop: mt, marginBottom: mb, ...style }} />;
}

export function CardSkeleton() {
  return (
    <div className="card sk-card" aria-hidden="true">
      <div className="media sk" />
      <div className="cbody">
        <Sk w="38%" h={11} />
        <Sk w="82%" h={15} />
        <Sk w="48%" h={11} />
        <Sk w="34%" h={16} mt={4} />
        <Sk h={42} r={999} mt="auto" />
      </div>
    </div>
  );
}

export function GridSkeleton({ n = 8, cols = '' }) {
  return (
    <div className={`grid ${cols}`.trim()} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

export function PageHeadSkeleton({ crumb = true }) {
  return (
    <div className="ph"><div className="container">
      {crumb && <Sk w={110} h={12} mb={16} />}
      <Sk w="min(340px,62%)" h={52} mb={14} r={10} />
      <Sk w="min(430px,84%)" h={14} />
    </div></div>
  );
}

export function CartSkeleton() {
  return (
    <div className="container" role="status" aria-label="Loading your bag" style={{ padding: '36px 20px 80px' }}>
      <Sk w={220} h={36} mb={26} r={10} />
      <div className="sk-cols">
        <div>
          {[0, 1, 2].map((i) => (
            <div className="line" key={i}>
              <div className="media sk" />
              <div style={{ display: 'grid', gap: 10 }}><Sk w="30%" h={11} /><Sk w="70%" h={15} /><Sk w="40%" h={12} /></div>
              <Sk w={70} h={18} />
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <Sk w="50%" h={22} /><Sk h={14} /><Sk h={14} /><Sk h={14} w="80%" /><Sk h={50} r={999} mt={10} />
        </div>
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="container" role="status" aria-label="Loading checkout" style={{ padding: '36px 20px 80px' }}>
      <Sk w={200} h={36} mb={26} r={10} />
      <div className="sk-cols">
        <div style={{ display: 'grid', gap: 16 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} style={{ display: 'grid', gap: 8 }}><Sk w="28%" h={12} /><Sk h={48} r={12} /></div>)}
        </div>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <Sk w="50%" h={22} /><Sk h={14} /><Sk h={14} /><Sk h={14} w="80%" /><Sk h={50} r={999} mt={10} />
        </div>
      </div>
    </div>
  );
}
