import csvParse from 'csv-parse';
import fs from 'fs';
import { getCustomRepository, getRepository, In } from 'typeorm';
import Category from '../models/Category';
import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';

interface csvTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filepath: string): Promise<Transaction[]> {
    const contactsReadStream = fs.createReadStream(`./${filepath}`);
    const parsers = csvParse({
      delimiter: ',',
      from_line: 2,
    });
    const parseCSV = contactsReadStream.pipe(parsers);

    const transactions: csvTransaction[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((ceil: string) =>
        ceil.trim(),
      );

      if (!title || !type || !value) return;

      categories.push(category);
      transactions.push({ title, type, value: parseFloat(value), category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    const categoriesRepositories = getRepository(Category);
    const existsCategories = await categoriesRepositories.find({
      where: { title: In(categories) },
    });

    const existsCategoriesTitles = existsCategories.map(
      (category: Category) => category.title,
    );

    const addCategoriesTitles = categories
      .filter(category => !existsCategoriesTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoriesRepositories.create(
      addCategoriesTitles.map(title => ({
        title,
      })),
    );

    await categoriesRepositories.save(newCategories);

    const finalCategories = [...newCategories, ...existsCategories];

    const transactionsRepository = getCustomRepository(TransactionsRepository);

    const createdTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(createdTransactions);

    await fs.promises.unlink(filepath);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
