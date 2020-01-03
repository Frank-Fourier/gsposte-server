import { DocumentQuery, Document, Model } from "mongoose";
import { ObjectId } from "mongodb";
import { injectable, unmanaged } from "inversify";
import httpErrors from "http-errors";

export interface PaginateOptions {
    pageIndex: number
    pageSize: number
    sort?: any
    populate?: string
    select?: string
}
export interface Paginated<T extends Document> {
    meta: {
        total: number
        pages: number
    },
    docs: T[]
}

@injectable()
export class MongoService<DTO, Doc extends Document> {

    constructor(@unmanaged() public model: Model<Doc>) {}

    public queryById(id: string): DocumentQuery<Doc, Doc> {
        this.checkValidObjectId(id);
        return this.model.findById(id);
    }
    public queryOne(query: any): DocumentQuery<Doc, Doc> {
        return this.model.findOne(query);
    }
    public queryMany(query: any, pagination?: PaginateOptions): DocumentQuery<Doc[], Doc> {
        return !pagination ?
            this.model.find(query) : // No pagination
            this.model.find(query) // With pagination
                .skip(pagination.pageIndex * pagination.pageSize)
                .limit(pagination.pageSize)
                .sort(pagination.sort || {})
                .populate(pagination.populate || "")
                .select(pagination.select || "");
    }

    public async paginate(conditions: Partial<DTO> | any, pagination: PaginateOptions): Promise<Paginated<Doc>> {
        const docsCount = await this.model.estimatedDocumentCount();
        return {
            meta: {
                total: docsCount,
                pages: Math.ceil(docsCount / pagination.pageSize)
            },
            docs: await this.queryMany(conditions, pagination).orFail().exec()
        };
    }

    public async save(obj: DTO): Promise<Doc> {
        return await this.model.create(obj);
    }

    public findById(id: string): Promise<Doc> {
        this.checkValidObjectId(id);
        return this.queryById(id).orFail().exec();
    }
    public find(conditions: Partial<DTO> | any): Promise<Doc[]> {
        return this.queryMany(conditions).orFail().exec();
    }

    public updateById(id: string, updateBody: Partial<DTO> | any): Promise<Doc> {
        this.checkValidObjectId(id);
        return this.model.findByIdAndUpdate(id, updateBody, { new: true, runValidators: true }).orFail().exec();
    }
    public updateOne(conditions: Partial<DTO> | any, updateBody: Partial<DTO> | any, upsert: boolean = false): Promise<Doc> {
        return this.model.findOneAndUpdate(conditions, updateBody, {
            new: true,
            runValidators: true,
            upsert: upsert,
            setDefaultsOnInsert: true
        }).orFail().exec();
    }

    public deleteById(id: string): Promise<Doc> {
        this.checkValidObjectId(id);
        return this.model.findByIdAndDelete(id).orFail().exec();
    }

    public countDocuments(conditions?: Partial<DTO> | any): Promise<number> {
        return this.model.countDocuments(conditions || {}).orFail().exec();
    }

    public isObjectIdValid(id: ObjectId | string | number): boolean {
        return ObjectId.isValid(id);
    }
    public checkValidObjectId(id: ObjectId | string | number) {
        if (!this.isObjectIdValid(id)) {
            throw new httpErrors.BadRequest("Malformed object id!");
        }
    }

    public paginateOptionsFromQuery(query: any): PaginateOptions {
        return {
            pageIndex: parseInt(query.pageIndex) || 0,
            pageSize: parseInt(query.pageSize) || 10,
            sort: JSON.parse(query.sort || '{}'),
            populate: query.populate || '',
            select: query.select || '',
        };
    }

}
