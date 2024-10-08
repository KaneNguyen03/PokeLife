import { Injectable, NotFoundException } from '@nestjs/common'
import { CreateIngredientDto } from './dto/create-ingredient.dto'
import { UpdateIngredientDto } from './dto/update-ingredient.dto'

import { Prisma } from '@prisma/client'
import { DatabaseService } from 'src/database/database.service'

@Injectable()
export class IngredientService {
  constructor(private readonly databaseService: DatabaseService) { }

  async create(createIngredientDto: CreateIngredientDto) {
    try {
      const ingredientData: Prisma.IngredientsCreateInput = {
        Name: createIngredientDto.name,
        Description: createIngredientDto.description ?? '',
        Price: createIngredientDto.price,
        Calories: createIngredientDto.calories,
        IngredientImage: createIngredientDto.image ?? '',
      }

      const checkIngredient = await this.databaseService.ingredients.create({
        data: ingredientData,
      })

      if (!checkIngredient) throw new Error('Fail to create ingredient')
      return 'Create ingredient successfully'
    } catch (error) {
      console.log('Error when create ingredient: ', error)
    }
  }

  async findAll() {
    try {
      const list = await this.databaseService.ingredients.findMany()
      if (list.length == 0)
        throw new NotFoundException('Not found any ingredients')
      return list
    } catch (error) {
      console.log('Error when get all ingredient', error)
    }
  }

  async findIngredientsByFoodID(foodID: string) {
    const customDishIngredients = await this.databaseService.customDishIngredients.findMany({
      where: {
        FoodID: foodID,
        IsDeleted: false, 
      },
      include: {
        Ingredient: true, 
      },
    })

    if (customDishIngredients.length === 0) {
      throw new NotFoundException('Food not found or has no ingredients.')
    }

    // Map to desired response structure
    return customDishIngredients.map(item => ({
      ingredientID: item.IngredientID,
      name: item.Ingredient.Name,
      quantity: item.Quantity,
      description: item.Ingredient.Description,
      calories: item.Ingredient.Calories,
      price: item.Ingredient.Price,
    }))
  }

  async findOne(id: string) {
    try {
      const ing = await this.databaseService.ingredients.findUnique({
        where: {
          IngredientID: id,
        },
      })
      if (!ing) throw new NotFoundException(`Not found a ingredients ${id}`)
      return ing
    } catch (error) {
      console.log('Error when get a ingredient', error)
    }
  }

  async update(id: string, updateIngredientDto: UpdateIngredientDto) {
    try {
      const updateIngredient =
        await this.databaseService.ingredients.findUnique({
          where: {
            IngredientID: id,
          },
        })

      if (!updateIngredient)
        throw new NotFoundException(`Not found ingredient ID ${id}`)

      const ingredientData: Prisma.IngredientsUpdateInput = {
        Name: updateIngredientDto.name,
        Description:
          updateIngredientDto.description ?? updateIngredient.Description,
        Price: updateIngredientDto.price,
        Calories: updateIngredientDto.calories,
        IngredientImage:
          updateIngredientDto.image ?? updateIngredient.IngredientImage,
      }

      const checkIngredient = await this.databaseService.ingredients.update({
        where: {
          IngredientID: id,
        },
        data: ingredientData,
      })

      if (!checkIngredient) throw new Error('Fail to update ingredient')
      return 'Update ingredient successfully'
    } catch (error) {
      console.log('Error when update ingredient: ', error)
    }
  }

  async remove(id: string) {
    try {
      const removeIngredient =
        await this.databaseService.ingredients.findUnique({
          where: {
            IngredientID: id,
          },
        })

      if (!removeIngredient)
        throw new NotFoundException(`Not found ingredient ID ${id}`)
      const check = await this.databaseService.ingredients.update({
        where: { IngredientID: id },
        data: {
          IsDeleted: true,
        },
      })
      if (!check) throw new Error('Fail to remove ingredient')
      return 'Ingredient deleted'
    } catch (error) {
      console.log('Error when remove ingredient: ', error)
    }
    return await this.databaseService.ingredients.delete({
      where: { IngredientID: id },
    })
  }
}
