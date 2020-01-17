import { DocumentQuery, Document, Model, Error } from "mongoose";
import { ObjectId } from "mongodb";
import { injectable, unmanaged } from "inversify";
import { Decoder } from "@mojotech/json-type-validation";
import httpErrors from "http-errors";

export interface PaginateOptions {
    pageIndex: number
    pageSize: number
    sort?: unknown
    populate?: string
    select?: string
}
export interface Paginated<T extends Document> {
    meta: {
        total: number
        pages: number
    }
    docs: T[]
}

type MongoQuery<T> = Partial<T> | Object;

@injectable()
export class MongoRepository<DTO, Doc extends Document> {

    constructor(
        @unmanaged() private model: Model<Doc>,
        @unmanaged() private decoder: Decoder<DTO>
    ) {}

    public async save(object: DTO): Promise<Doc> {
        try {
            return await this.model.create(object);
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    private queryMany(query: MongoQuery<DTO>, pagination?: PaginateOptions): DocumentQuery<Doc[], Doc> {
        return !pagination ?
            this.model.find(query) : // No pagination
            this.model.find(query)   // With pagination
                .skip(pagination.pageIndex * pagination.pageSize)
                .limit(pagination.pageSize)
                .sort(pagination.sort || {})
                .populate(pagination.populate || "")
                .select(pagination.select || "");
    }

    public async findById(id: string): Promise<Doc> {
        this.checkValidObjectId(id);
        try {
            return await this.model.findById(id).orFail().exec();
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    public async find(query: MongoQuery<DTO>): Promise<Doc[]> {
        try {
            return await this.queryMany(query).orFail().exec();
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    public async paginate(query: MongoQuery<DTO>, pagination: PaginateOptions): Promise<Paginated<Doc>> {
        try {
            const docsCount = await this.model.estimatedDocumentCount();
            return {
                meta: {
                    total: docsCount,
                    pages: Math.ceil(docsCount / pagination.pageSize)
                },
                docs: await this.queryMany(query, pagination).orFail().exec()
            };
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    public async findOne(query: MongoQuery<DTO>): Promise<Doc> {
        try {
            return await this.model.findOne(query).orFail().exec();
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    public async updateById(id: string, updateBody: Partial<DTO>, upsert: boolean = false): Promise<Doc> {
        this.checkValidObjectId(id);
        try {
            return await this.model.findByIdAndUpdate(id, updateBody, {
                new: true,
                runValidators: true,
                upsert: upsert,
                setDefaultsOnInsert: true,
                context: "query"
            }).orFail().exec();
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    public async updateOne(query: MongoQuery<DTO>, updateBody: Partial<DTO>, upsert: boolean = false): Promise<Doc> {
        try {
            return await this.model.findOneAndUpdate(query, updateBody, {
                new: true,
                runValidators: true,
                upsert: upsert,
                setDefaultsOnInsert: true,
                context: "query"
            }).orFail().exec();
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    public async deleteById(id: string): Promise<Doc> {
        this.checkValidObjectId(id);
        try {
            return await this.model.findByIdAndDelete(id).orFail().exec();
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    public countDocuments(query?: MongoQuery<DTO>): Promise<number> {
        try {
            return this.model.countDocuments(query || {}).orFail().exec();
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    public checkValidObjectId(id: string | number | ObjectId) {
        if (!ObjectId.isValid(id)) {
            throw new httpErrors.BadRequest("Malformed object id!");
        }
    }

    public paginateOptionsFromObject(object: any): PaginateOptions {
        return {
            pageIndex: parseInt(object["pageIndex"] || "10"),
            pageSize: parseInt(object["pageSize"] || "0"),
            sort: JSON.parse(object["sort"] || "{}"),
            populate: object["populate"] || "",
            select: object["select"] || "",
        };
    }

    public validateObject(object: Object) {
        try {
            this.decoder.runWithException(object);
        } catch (err) {
            throw new httpErrors.BadRequest(err);
        }
    }

    private formatMongoError(error: Error) {
        // I'm not using a switch statement because the linter is convinced that error.name can ONLY be "MongooseError"
        if (error.name === "ValidationError") {
            throw this.formatValidationError(error as Error.ValidationError);
        }
        if (error.name === "DocumentNotFoundError") {
            throw this.formatDocumentNotFoundError(error as Error.DocumentNotFoundError);
        }

        throw new httpErrors.InternalServerError(`${error.name}: ${error.message}`);
    }

    private formatValidationError(baseError: Error.ValidationError) {
        return (Object.keys(baseError.errors).every(error => baseError.errors[error].kind === "unique"))
            ? new httpErrors.Conflict(`Expected these parameters to be unique: ${Object.keys(baseError.errors).join(", ")}`)
            : new httpErrors.BadRequest(Object.keys(baseError.errors).map(error => baseError.errors[error].message).join(" "));
    }

    private formatDocumentNotFoundError(baseError: Error.DocumentNotFoundError) {
        return new httpErrors.NotFound(baseError.message);
    }

}
