import './skeleton.scss';

function Blocks({ count, kind }: { count: number; kind: 'kpi' | 'panel' | 'cover' }) {
    return Array.from({ length: count }, (_, index) => (
        <span className={`skeleton-block skeleton-block--${kind}`} key={index} />
    ));
}

// The shape of a profile page (KPIs, panels, covers) while it has nothing to show yet
export function PageSkeleton({ header = false }: { header?: boolean }) {
    return (
        <div aria-hidden="true" className="page-skeleton">
            {header ? (
                <div className="page-skeleton__header">
                    <span className="skeleton-block skeleton-block--avatar" />
                    <span className="skeleton-block skeleton-block--name" />
                </div>
            ) : null}
            <div className="page-skeleton__kpis">
                <Blocks count={4} kind="kpi" />
            </div>
            <div className="page-skeleton__panels">
                <Blocks count={2} kind="panel" />
            </div>
            <div className="page-skeleton__covers">
                <Blocks count={12} kind="cover" />
            </div>
        </div>
    );
}
