const Utils = {
    getFlatRows: (scanResult) => {
        if (!scanResult) return [];
        const rows = [];
        const meta = scanResult.meta || {};
        const summary = scanResult.summary || {};
        const baseData = [
            meta.partName || '', meta.partNumber || '', meta.model || '',
            meta.nama || '', meta.shift || '', meta.linePos || '', meta.date || '',
            summary.totalProduksi || 0, summary.totalOK || 0,
            summary.totalNG || 0, summary.totalNGPoint || 0, summary.totalScrap || 0
        ];
        if (scanResult.details && scanResult.details.length > 0) {
            scanResult.details.forEach(detail => {
                rows.push([...baseData, detail.pointCheck || '', detail.checkNo || '', detail.problem || '', detail.defectCode || '', detail.qty || 0]);
            });
        } else {
            rows.push([...baseData, '-', '-', 'Tidak ada data NG (All OK)', '-', 0]);
        }
        return rows;
    },

    getValidationErrors: (scanResult) => {
        if (!scanResult) return [];
        const { totalProduksi, totalOK, totalNG, totalNGPoint } = scanResult.summary;
        const errors = [];

        // Validation production vs physical parts (NG Frame)
        const sumParts = (totalOK || 0) + (totalNG || 0);
        if (totalProduksi !== sumParts) {
            errors.push(`Total Produksi (${totalProduksi}) ≠ OK+NG Frame (${sumParts})`);
        }

        // Validation NG Point vs detail sum
        const detailNGSum = (scanResult.details || []).reduce((sum, d) => sum + (parseInt(d.qty) || 0), 0);
        if (totalNGPoint !== detailNGSum) {
            errors.push(`Total NG Point di Summary (${totalNGPoint}) ≠ Total Rincian NG (${detailNGSum})`);
        }

        return errors;
    },

    exportCSV: (scanResult) => {
        if (!scanResult) return;
        const flatRows = Utils.getFlatRows(scanResult);
        const headers = ["Part Name", "Part Number", "Model", "Nama Inspector", "Shift", "Line/Pos", "Date", "Total Produksi", "Total OK", "Total NG", "NG Point", "Total Scrap", "Point Check", "Check No", "Problem", "Code", "Qty NG"];

        const delimiter = ";";
        const csvContent = "\ufeff" + "sep=;\n" + [headers, ...flatRows].map(row =>
            row.map(cell => `"${cell === null || cell === undefined ? "" : cell}"`).join(delimiter)
        ).join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const safePartNumber = (scanResult.meta.partNumber || 'Unknown').replace(/[^a-zA-Z0-9-]/g, '_');
        link.setAttribute('download', `Rekap_QC_${safePartNumber}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    formatDate: (dateString) => {
        if (!dateString) return "";
        return dateString.split('T')[0];
    },

    // Skema A: Matriks Homografi 3D & Proyeksi Perspektif
    solve8x8: (A, B) => {
        const n = 8;
        for (let i = 0; i < n; i++) {
            let maxEl = Math.abs(A[i][i]);
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(A[k][i]) > maxEl) {
                    maxEl = Math.abs(A[k][i]);
                    maxRow = k;
                }
            }
            for (let k = i; k < n; k++) {
                const tmp = A[maxRow][k];
                A[maxRow][k] = A[i][k];
                A[i][k] = tmp;
            }
            const tmp = B[maxRow];
            B[maxRow] = B[i];
            B[i] = tmp;

            for (let k = i + 1; k < n; k++) {
                const c = -A[k][i] / A[i][i];
                for (let j = i; j < n; j++) {
                    if (i === j) {
                        A[k][j] = 0;
                    } else {
                        A[k][j] += c * A[i][j];
                    }
                }
                B[k] += c * B[i];
            }
        }

        const x = new Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            x[i] = B[i] / A[i][i];
            for (let k = i - 1; k >= 0; k--) {
                B[k] -= A[k][i] * x[i];
            }
        }
        return x;
    },

    getPerspectiveTransform: (src, dst) => {
        const A = [];
        const B = [];
        for (let i = 0; i < 4; i++) {
            const x = src[i].x;
            const y = src[i].y;
            const u = dst[i].x;
            const v = dst[i].y;

            A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
            A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
            B.push(u);
            B.push(v);
        }
        const h = Utils.solve8x8(A, B);
        return [
            h[0], h[1], h[2],
            h[3], h[4], h[5],
            h[6], h[7], 1.0
        ];
    },

    invert3x3: (m) => {
        const a = m[0], b = m[1], c = m[2],
              d = m[3], e = m[4], f = m[5],
              g = m[6], h = m[7], i = m[8];

        const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
        if (Math.abs(det) < 1e-8) return null;

        const invdet = 1.0 / det;
        return [
            (e * i - f * h) * invdet,
            (c * h - b * i) * invdet,
            (b * f - c * e) * invdet,
            (f * g - d * i) * invdet,
            (a * i - c * g) * invdet,
            (c * d - a * f) * invdet,
            (d * h - e * g) * invdet,
            (b * g - a * h) * invdet,
            (a * e - b * d) * invdet
        ];
    },

    warpPerspective: (srcCanvas, dstCanvas, srcPoints, dstWidth, dstHeight) => {
        const srcCtx = srcCanvas.getContext('2d');
        const dstCtx = dstCanvas.getContext('2d');

        const srcWidth = srcCanvas.width;
        const srcHeight = srcCanvas.height;

        const srcData = srcCtx.getImageData(0, 0, srcWidth, srcHeight);
        const dstData = dstCtx.createImageData(dstWidth, dstHeight);

        const dstPoints = [
            { x: 0, y: 0 },
            { x: dstWidth, y: 0 },
            { x: dstWidth, y: dstHeight },
            { x: 0, y: dstHeight }
        ];

        const H = Utils.getPerspectiveTransform(srcPoints, dstPoints);
        const H_inv = Utils.invert3x3(H);
        if (!H_inv) return false;

        const m00 = H_inv[0], m01 = H_inv[1], m02 = H_inv[2],
              m10 = H_inv[3], m11 = H_inv[4], m12 = H_inv[5],
              m20 = H_inv[6], m21 = H_inv[7], m22 = H_inv[8];

        const srcPixels = srcData.data;
        const dstPixels = dstData.data;

        for (let v = 0; v < dstHeight; v++) {
            for (let u = 0; u < dstWidth; u++) {
                const w = m20 * u + m21 * v + m22;
                const x = (m00 * u + m01 * v + m02) / w;
                const y = (m10 * u + m11 * v + m12) / w;

                const dstIndex = (v * dstWidth + u) * 4;

                if (x >= 0 && x < srcWidth - 1 && y >= 0 && y < srcHeight - 1) {
                    const x0 = Math.floor(x);
                    const y0 = Math.floor(y);
                    const x1 = x0 + 1;
                    const y1 = y0 + 1;

                    const dx = x - x0;
                    const dy = y - y0;

                    const w00 = (1 - dx) * (1 - dy);
                    const w10 = dx * (1 - dy);
                    const w01 = (1 - dx) * dy;
                    const w11 = dx * dy;

                    const idx00 = (y0 * srcWidth + x0) * 4;
                    const idx10 = (y0 * srcWidth + x1) * 4;
                    const idx01 = (y1 * srcWidth + x0) * 4;
                    const idx11 = (y1 * srcWidth + x1) * 4;

                    for (let c = 0; c < 4; c++) {
                        dstPixels[dstIndex + c] = Math.round(
                            w00 * srcPixels[idx00 + c] +
                            w10 * srcPixels[idx10 + c] +
                            w01 * srcPixels[idx01 + c] +
                            w11 * srcPixels[idx11 + c]
                        );
                    }
                } else {
                    dstPixels[dstIndex + 0] = 255; // White background for out-of-bounds
                    dstPixels[dstIndex + 1] = 255;
                    dstPixels[dstIndex + 2] = 255;
                    dstPixels[dstIndex + 3] = 255;
                }
            }
        }
        dstCtx.putImageData(dstData, 0, 0);
        return true;
    }
};

window.AppUtils = Utils;
