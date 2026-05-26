import { Request, Response } from "express";
import { inject, injectable } from "inversify";
import httpErrors from "http-errors";
import moment from "moment";
import XLSX from "xlsx";
import { AuthService } from "@services/AuthService";
import { RevenueShareService } from "@services/RevenueShareService";
import { InvoiceService } from "@services/InvoiceService";

/**
 * Tutti gli endpoint sono admin-only. La protezione è doppia: il middleware
 * passport nella Route richiede già un JWT valido, e qui `authService.adminOnly(req)`
 * controlla che il ruolo sia ROLE_ADMIN.
 *
 * IMPORTANTE: "admin" QUI si riferisce al ruolo tecnico ROLE_ADMIN (chi gestisce
 * la piattaforma a livello applicativo). Non va confuso con "amministratore di
 * condominio", che è il TIPO DI USER tipico della piattaforma e che riceve la
 * admin fee del 30% sul taxable delle proprie fatture.
 */
@injectable()
export class RevenueShareController {

    @inject(AuthService) private authService: AuthService;
    @inject(RevenueShareService) private revenueShareService: RevenueShareService;
    @inject(InvoiceService) private invoiceService: InvoiceService;

    // ─── SINGLETON GLOBALE ────────────────────────────────────────────────

    public async getGlobal(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const setting = await this.revenueShareService.getGlobalSetting();
        return res.status(200).send(setting);
    }

    /**
     * Body atteso (tutti i campi opzionali, almeno uno richiesto):
     * {
     *   adminFeePercent?: number,           // 0..100, max 2 decimali
     *   residualBeneficiaries?: [           // esattamente 2 elementi
     *     { _id?, name, fiscalCode, iban?, percent, isCompany? },
     *     ...
     *   ]
     * }
     */
    public async updateGlobal(req: Request, res: Response) {
        const admin = await this.authService.adminOnly(req);
        if (req.body.adminFeePercent === undefined && req.body.residualBeneficiaries === undefined) {
            throw new httpErrors.BadRequest("Body vuoto. Specifica almeno uno tra adminFeePercent e residualBeneficiaries.");
        }
        const updated = await this.revenueShareService.updateGlobalSetting(
            req.body.adminFeePercent,
            req.body.residualBeneficiaries,
            admin.id
        );
        return res.status(200).send(updated);
    }

    // ─── PREVIEW / RESOLVE ────────────────────────────────────────────────

    /**
     * Anteprima dello split che VERREBBE applicato a una specifica fattura
     * SE la pagassi adesso. Utile per la UI: l'admin vede a quale amministratore
     * (User) andrebbe la fee, e quanto andrebbe a Solutions / Tandoi sul residuo.
     * NON modifica nulla nel DB (read-only, no snapshot).
     */
    public async previewInvoiceSplit(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const invoice = await this.invoiceService.findById(req.params.id);
        if (invoice.splitSnapshot) {
            return res.status(200).send({
                lines: invoice.splitSnapshot.lines,
                basisValue: invoice.splitSnapshot.basisValue,
                adminFeeAmount: invoice.splitSnapshot.adminFeeAmount,
                residuoValue: invoice.splitSnapshot.residuoValue,
                adminFeePercentApplied: invoice.splitSnapshot.adminFeePercentApplied,
                snapshotted: true,
                snapshottedAt: invoice.splitSnapshot.computedAt,
            });
        }
        const resolved = await this.revenueShareService.resolve(invoice);
        return res.status(200).send({ ...resolved, snapshotted: false });
    }

    // ─── REPORT PAYOUTS ───────────────────────────────────────────────────

    public async payoutReport(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const { from, to } = this.parseDateRange(req);
        const report = await this.revenueShareService.payoutReport(from, to);
        return res.status(200).send(report);
    }

    /**
     * Stesso payoutReport ma serializzato come xlsx (2 fogli).
     * Foglio "Riepilogo" diviso in 2 sezioni:
     *   - AMMINISTRATORI (chi opera la piattaforma; una riga per ogni User che ha
     *     emesso fatture nel range)
     *   - RESIDUO (i 2 beneficiari fissi: Solutions + Tandoi)
     * Foglio "Dettaglio": una riga per ogni fattura nel range.
     */
    public async payoutReportXlsx(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const { from, to } = this.parseDateRange(req);
        const report = await this.revenueShareService.payoutReport(from, to);

        const wb = XLSX.utils.book_new();

        const summaryRows: any[][] = [];
        summaryRows.push([ "AMMINISTRATORI (admin fee sulle proprie fatture)" ]);
        summaryRows.push([ "Nome", "CF / P.IVA", "IBAN", "N. Fatture", "Admin Fee € (imponibile)" ]);
        for (const a of report.administrators) {
            summaryRows.push([
                a.name,
                a.fiscalCode || "",
                a.iban || "",
                a.invoiceCount,
                Number(a.amount.toFixed(2)),
            ]);
        }
        summaryRows.push([ "SUBTOTALE AMMINISTRATORI", "", "", "", Number(report.totalAdminFee.toFixed(2)) ]);
        summaryRows.push([]);
        summaryRows.push([ "RESIDUO (beneficiari fissi)" ]);
        summaryRows.push([ "Nome", "CF / P.IVA", "IBAN", "%", "N. Fatture", "Quota € (imponibile)" ]);
        for (const r of report.residuals) {
            summaryRows.push([
                r.name,
                r.fiscalCode || "",
                r.iban || "",
                Number(r.percent.toFixed(2)),
                r.invoiceCount,
                Number(r.amount.toFixed(2)),
            ]);
        }
        summaryRows.push([ "SUBTOTALE RESIDUO", "", "", "", "", Number(report.totalResiduo.toFixed(2)) ]);
        summaryRows.push([]);
        summaryRows.push([
            "TOTALI",
            `${report.totalInvoices} fatture`,
            `Taxable: ${report.totalTaxable.toFixed(2)} €`,
            `Admin fee: ${report.totalAdminFee.toFixed(2)} €`,
            `Residuo: ${report.totalResiduo.toFixed(2)} €`,
        ]);

        const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
        wsSummary["!cols"] = [
            { wch: 32 }, { wch: 22 }, { wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 22 },
        ];
        XLSX.utils.book_append_sheet(wb, wsSummary, "Riepilogo");

        const detailHeader = [
            "N. Fattura", "Data Pagamento", "Cliente", "Amministratore",
            "Imponibile €", "% Fee", "Admin Fee €", "Residuo €",
        ];
        const detailRows: any[][] = [ detailHeader ];
        for (const d of report.details) {
            detailRows.push([
                d.invoiceNumber,
                d.paymentDate,
                d.senderName,
                d.adminName,
                Number(d.taxable.toFixed(2)),
                Number((d.adminFeePercentApplied ?? 0).toFixed(2)),
                Number(d.adminFeeAmount.toFixed(2)),
                Number(d.residuoValue.toFixed(2)),
            ]);
        }
        const wsDetails = XLSX.utils.aoa_to_sheet(detailRows);
        wsDetails["!cols"] = [
            { wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 26 },
            { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
        ];
        XLSX.utils.book_append_sheet(wb, wsDetails, "Dettaglio");

        const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        const filename = `payout_${report.from}_${report.to}.xlsx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.status(200).send(buf);
    }

    private parseDateRange(req: Request): { from: Date, to: Date } {
        const fromStr = (req.query.from as string) || req.body?.from;
        const toStr = (req.query.to as string) || req.body?.to;
        if (!fromStr || !toStr) {
            throw new httpErrors.BadRequest("Parametri obbligatori: 'from' e 'to' (YYYY-MM-DD).");
        }
        const from = moment(fromStr, "YYYY-MM-DD", true).startOf("day").toDate();
        const to = moment(toStr, "YYYY-MM-DD", true).endOf("day").toDate();
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            throw new httpErrors.BadRequest("Formato date non valido. Usa YYYY-MM-DD.");
        }
        return { from, to };
    }

}
