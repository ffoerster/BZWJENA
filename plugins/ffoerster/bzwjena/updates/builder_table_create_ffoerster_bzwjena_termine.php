<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableCreateFfoersterBzwjenaTermine extends Migration
{
    public function up()
    {
        Schema::create('ffoerster_bzwjena_termine', function($table)
        {
            $table->engine = 'InnoDB';
            $table->increments('id');
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->string('termin_title');
            $table->string('termin_slug');
        });
    }
    
    public function down()
    {
        Schema::dropIfExists('ffoerster_bzwjena_termine');
    }
}
