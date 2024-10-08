import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, TransactionStatus } from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class OrderService {
  constructor(private readonly databaseService: DatabaseService) {}

  //DONE
  async create(createOrderDto: CreateOrderDto, currentUserId: string) {
    try {
      // Ensure order details are provided
      if (
        !createOrderDto.orderDetails ||
        createOrderDto.orderDetails.length === 0
      ) {
        throw new BadRequestException('Missing order details');
      }

      const orderDetailList = createOrderDto.orderDetails;

      // Calculate total price from order details
      let totalPrice = await this.calculateTotalPrice(orderDetailList);

      //xử lí nếu có combo
      let comboItemList;
      if (createOrderDto.comboID != null) {
        const combo = await this.databaseService.combos.findUnique({
          where: {
            ComboID: createOrderDto.comboID,
          },
        });
        if (!combo)
          throw new NotFoundException(
            `Not found combo ID ${createOrderDto.comboID}`,
          );

        //cộng giá combo vào total tạo order nếu có combo
        totalPrice = totalPrice.plus(new Decimal(combo.Price));
        // eslint-disable-next-line prefer-const
        comboItemList = await this.databaseService.comboItems.findMany({
          where: {
            ComboID: combo.ComboID,
          },
        });
        if (comboItemList.length == 0)
          throw new NotFoundException(
            `Not found any items of combo ID ${createOrderDto.comboID}`,
          );
        for (const item of comboItemList) {
          const foodItem = await this.databaseService.food.findUnique({
            where: {
              FoodID: item.FoodID,
            },
          });
          if (!foodItem)
            throw new NotFoundException(
              `Not found any food of combo item ID ${item.ComboItemID}`,
            );
        }
      }

      // Create order data
      const orderData: Prisma.OrdersCreateInput = {
        Address: createOrderDto.address,
        PhoneNumber: createOrderDto.phoneNumber,
        CustomerName: createOrderDto.customerName,
        TotalPrice: totalPrice,
        IsDeleted: false,
        OrderStatus: OrderStatus.Pending,
        Customer: {
          connect: { CustomerID: currentUserId }, // Connect order to customer
        },
      };

      // Create order
      const checkOrder = await this.databaseService.orders.create({
        data: orderData,
      });

      if (checkOrder) {
        // Create order details
        for (const detail of orderDetailList) {
          const food = await this.databaseService.food.findUnique({
            where: { FoodID: detail.foodID },
          });
          if (!food) {
            throw new Error('Food not found');
          }

          const orderDetailData: Prisma.OrderDetailsCreateInput = {
            Quantity: detail.quantity,
            Price: new Decimal(food.Price), // Ensure Price is a Decimal
            Order: {
              connect: { OrderID: checkOrder.OrderID }, // Connect order detail with the created order
            },
            Food: {
              connect: { FoodID: detail.foodID }, // Connect order detail with the corresponding food
            },
            IsDeleted: false, // Default not deleted
          };

          // Create order detail in the database
          const createdOrderDetail =
            await this.databaseService.orderDetails.create({
              data: orderDetailData,
            });

          // Check if order detail was created successfully
          if (!createdOrderDetail) {
            throw new Error('Fail to create order detail when creating order');
          }
        }

        //tạo orderdetails nếu có combo
        if (comboItemList) {
          for (const item of comboItemList) {
            const food = await this.databaseService.food.findUnique({
              where: { FoodID: item.foodID },
            });
            if (!food) {
              throw new Error('Food of combo not found');
            }

            const orderDetailData: Prisma.OrderDetailsCreateInput = {
              Quantity: item.quantity,
              Price: new Decimal(food.Price), // Ensure Price is a Decimal
              Order: {
                connect: { OrderID: checkOrder.OrderID }, // Connect order detail with the created order
              },
              Food: {
                connect: { FoodID: item.foodID }, // Connect order detail with the corresponding food
              },
              IsDeleted: false, // Default not deleted
            };

            // Create order detail in the database
            const createdOrderDetail =
              await this.databaseService.orderDetails.create({
                data: orderDetailData,
              });

            // Check if order detail was created successfully
            if (!createdOrderDetail) {
              throw new Error(
                'Fail to create order detail from combo when creating order',
              );
            }
          }
        }

        // Create transaction data
        const transactionData: Prisma.TransactionsCreateInput = {
          PaymentMethod: createOrderDto.paymentMethod,
          Amount: new Decimal(totalPrice), // Ensure Amount is a Decimal
          TransactionDate: new Date(), // Use current date if not provided
          IsDeleted: false, // Default not deleted
          Status: TransactionStatus.Pending,
          Order: {
            connect: { OrderID: checkOrder.OrderID }, // Connect order
          },
        };

        // Create transaction
        const checkTransaction = await this.databaseService.transactions.create(
          {
            data: transactionData,
          },
        );

        if (!checkTransaction) {
          throw new Error('Fail to create transaction when creating order');
        } else {
          return 'Create order successfully'; // Consider adding status code
        }
      } else {
        throw new Error('Fail to create order');
      }
    } catch (error) {
      console.log('Error when creating order: ', error);
      throw error;
    }
  }

  // Helper function to calculate total price
  private async calculateTotalPrice(orderDetails): Promise<Decimal> {
    const prices = await Promise.all(
      orderDetails.map(async (detail) => {
        const food = await this.databaseService.food.findUnique({
          where: { FoodID: detail.foodID },
        });
        if (!food) {
          throw new Error('Food not found');
        }
        return new Decimal(detail.quantity).times(new Decimal(food.Price)); // Use Decimal operations
      }),
    );

    return prices.reduce((acc, price) => acc.plus(price), new Decimal(0)); // Use Decimal operations
  }

  //DONE
  async findAll(pageIndex: number, pageSize: number, keyword: string = '') {
    try {
      const skip = (pageIndex - 1) * pageSize;
      const take = pageSize;

      // Condition for filtering
      const where: Prisma.OrdersWhereInput = {
        IsDeleted: false, // Filter out deleted orders
        ...(keyword && {
          OR: [
            { OrderID: { contains: keyword, mode: 'insensitive' } },
            { CustomerName: { contains: keyword, mode: 'insensitive' } },
            // Add other fields if necessary
          ],
        }),
      };

      // Count the total number of orders matching the criteria
      const totalOrders = await this.databaseService.orders.count({ where });

      // Fetch the orders from the database
      const orders = await this.databaseService.orders.findMany({
        skip,
        take,
        where,
        include: {
          Transactions: {
            // Include the related Transaction
            select: {
              PaymentMethod: true, // Select only the PaymentMethod
            },
          },
        },
      });

      // If no orders are found, throw an exception
      if (orders.length === 0) {
        throw new NotFoundException('No orders found');
      }

      // Calculate total pages
      const totalPages = Math.ceil(totalOrders / pageSize);

      // Transform the orders to include paymentMethod instead of Transactions
      const transformedOrders = orders.map((order) => {
        const paymentMethod =
          order.Transactions.length > 0
            ? order.Transactions[0].PaymentMethod
            : null; // Get the first payment method
        return {
          ...order,
          paymentMethod, // Replace Transactions with paymentMethod
          Transactions: undefined, // Optionally remove the Transactions array
        };
      });
      // Return orders with pagination info
      return {
        orders: transformedOrders,
        pagination: {
          pageIndex,
          pageSize,
          totalPages,
        },
      };
    } catch (error) {
      console.log('Error when get all orders: ', error);
      throw error; // Rethrow the error to be handled by the calling function or middleware
    }
  }

  //DONE
  async findAllByCustomerID(
    currentUserId: string,
    pageIndex: number,
    pageSize: number,
    keyword?: string,
  ) {
    try {
      const skip = (pageIndex - 1) * pageSize;
      const take = pageSize;

      // Điều kiện tìm kiếm
      const where: Prisma.OrdersWhereInput = {
        IsDeleted: false,
        CustomerID: currentUserId,
        ...(keyword && {
          OR: [
            { OrderID: { contains: keyword, mode: 'insensitive' } },
            { CustomerName: { contains: keyword, mode: 'insensitive' } },
            // Thêm các trường khác nếu cần
          ],
        }),
      };

      // Truy vấn các đơn hàng từ cơ sở dữ liệu
      const orders = await this.databaseService.orders.findMany({
        skip,
        take,
        where,
      });

      if (orders.length === 0) {
        const curUser = await this.databaseService.customers.findUnique({
          where: { CustomerID: currentUserId },
        });
        throw new NotFoundException(
          `Current user ${curUser?.FullName} doesn't have any orders`,
        );
      }
      return orders;
    } catch (error) {
      console.log('Error when get all orders of customer: ', error);
    }
  }

  //DONE
  async findDetailOfOneOrder(id: string) {
    try {
      console.log('Check');

      const orderToGet = await this.databaseService.orders.findUnique({
        where: {
          OrderID: id,
        },
      });

      if (!orderToGet) throw new NotFoundException(`Not found order ID ${id}`);

      const details = await this.databaseService.orderDetails.findMany({
        where: {
          OrderID: orderToGet.OrderID,
        },
      });

      // Sử dụng Promise.all để truy vấn food song song cho tất cả các order details
      const result = await Promise.all(
        details.map(async (detail) => {
          const food = await this.databaseService.food.findUnique({
            where: { FoodID: detail.FoodID },
          });

          if (!food) {
            throw new NotFoundException(
              `Not found food of order detail ID ${detail.OrderDetailID}`,
            );
          }

          return {
            Name: food.Name,
            Price: food.Price,
            Calories: food.Calories,
            Description: food.Description,
            Image: food.Image,
            Quantity: detail.Quantity,
          };
        }),
      );

      return result;
    } catch (error) {
      console.log('Error when get details of one order: ', error);
    }
  }

  //DONE
  async findOne(id: string) {
    try {
      const order = await this.databaseService.orders.findUnique({
        where: { OrderID: id, IsDeleted: false },
      });

      if (order == null) {
        throw new NotFoundException(`Order ${id} not found`);
      }

      return order;
    } catch (error) {
      console.log('Error when get a order: ', error);
    }
  }

  //DONE
  async update(id: string, updateOrderDto: UpdateOrderDto) {
    try {
      const orderToUpdate = await this.databaseService.orders.findUnique({
        where: { OrderID: id },
      });

      if (!orderToUpdate) {
        throw new NotFoundException(`Not found order ID ${id}`);
      }

      // Kiểm tra nếu status là finish hoặc cancelled
      if (
        orderToUpdate.OrderStatus === OrderStatus.Finished ||
        orderToUpdate.OrderStatus === OrderStatus.Cancelled
      ) {
        throw new BadRequestException('Cannot edit closed order');
      }

      const orderDataToUpdate: Prisma.OrdersUpdateInput = {
        OrderStatus: updateOrderDto.orderStatus,
        PhoneNumber: updateOrderDto.phoneNumber ?? orderToUpdate.PhoneNumber,
        CustomerName: updateOrderDto.customerName ?? orderToUpdate.CustomerName,
        Address: updateOrderDto.address ?? orderToUpdate.Address,
      };

      const checkUpdateOrder = await this.databaseService.orders.update({
        where: { OrderID: id },
        data: orderDataToUpdate,
      });

      let transactionStatus;
      if (updateOrderDto.orderStatus === OrderStatus.Finished)
        transactionStatus = TransactionStatus.Finished;
      else if (updateOrderDto.orderStatus === OrderStatus.Cancelled)
        transactionStatus = TransactionStatus.Cancelled;

      if (checkUpdateOrder) {
        // Lấy transaction tương ứng với order
        const transactionToUpdate =
          await this.databaseService.transactions.findFirst({
            where: {
              OrderID: id,
            },
          });
        // Nếu tìm thấy transaction
        if (transactionToUpdate) {
          // Chuẩn bị dữ liệu để cập nhật Transaction
          const transactionDataToUpdate: Prisma.TransactionsUpdateInput = {
            PaymentMethod:
              updateOrderDto.paymentMethod ?? transactionToUpdate.PaymentMethod, // Cập nhật nếu có paymentMethod
            Status: transactionStatus ?? TransactionStatus.Pending, // Cập nhật nếu có transactionStatus
            IsDeleted: false, // Giữ nguyên IsDeleted
          };

          // Cập nhật Transaction trong database
          const checkUpdateTransaction =
            await this.databaseService.transactions.update({
              where: { TransactionID: transactionToUpdate.TransactionID },
              data: transactionDataToUpdate,
            });

          // Kiểm tra xem Transaction có cập nhật thành công không
          if (!checkUpdateTransaction) {
            throw new Error('Fail to update transaction');
          }
          return 'Update order successfully';
        } else {
          throw new NotFoundException('Transaction not found for this order');
        }
      } else {
        throw new Error('Fail to update order');
      }
    } catch (error) {
      console.log('Error when update order: ', error);
    }
  }

  //DONE
  async remove(id: string) {
    try {
      const orderToRemove = this.databaseService.orders.findUnique({
        where: { OrderID: id },
      });

      if (!orderToRemove)
        throw new NotFoundException(`Not found order ID ${id}`);

      const orderListToRemove =
        await this.databaseService.orderDetails.findMany({
          where: {
            OrderID: id,
          },
        });

      if (orderListToRemove.length != 0) {
        for (const detail of orderListToRemove) {
          const check = this.databaseService.orderDetails.update({
            where: {
              OrderDetailID: detail.OrderDetailID,
            },
            data: {
              IsDeleted: true,
            },
          });
          if (!check) throw new Error('Fail to remove order details');
        }
      }

      const transactionToRemove =
        await this.databaseService.transactions.findFirst({
          where: {
            OrderID: id,
          },
        });

      if (transactionToRemove) {
        const check = await this.databaseService.transactions.update({
          where: {
            TransactionID: transactionToRemove.TransactionID,
          },
          data: {
            IsDeleted: true,
          },
        });
        if (!check) throw new Error('Fail to remove transaction');
      }

      const check = await this.databaseService.orders.update({
        where: {
          OrderID: id,
        },
        data: {
          IsDeleted: true,
        },
      });
      if (check) {
        return `Order ID ${id} is removed`;
      } else {
        throw new Error(`Fail to remove order ${id}`);
      }
    } catch (error) {
      console.log('Error when remove order: ', error);
    }
  }
}
