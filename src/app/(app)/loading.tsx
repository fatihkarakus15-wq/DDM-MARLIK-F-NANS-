/** Sayfa geçişlerinde sunucu yanıtı beklenirken anında görünen iskelet (telefonda "takıldı" hissini önler) */
export default function Loading() {
    return (
        <div className="skel" aria-busy="true" aria-label="Yükleniyor">
            <div className="skel-bar w40" />
            <div className="skel-box" />
            <div className="skel-box" />
            <div className="skel-box short" />
        </div>
    );
}
